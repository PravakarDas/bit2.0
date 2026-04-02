import { format } from 'date-fns';

export interface ZKTecoTransaction {
  id: number;
  emp: number;
  emp_code: string;
  first_name: string;
  last_name: string;
  department: string;
  position: string | null;
  punch_time: string;
  punch_state: string;
  punch_state_display: string;
  verify_type: number;
  verify_type_display: string;
  work_code: string;
  gps_location: string | null;
  area_alias: string;
  terminal_sn: string;
  temperature: number;
  is_mask: string;
  terminal_alias: string;
  upload_time: string;
  longitude: string | null;
  latitude: string | null;
}

export interface ZKTecoApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  msg: string;
  code: number;
  data: ZKTecoTransaction[];
}

export interface ProcessedTimeData {
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null; // HH:MM format
}

const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;

function parseZKTecoPunchTime(punchTime: string): Date {
  const normalized = punchTime.trim().replace(' ', 'T');

  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    return new Date(normalized);
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return new Date(normalized);
  }

  const [, year, month, day, hour, minute, second = '0'] = match;

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    ) - BANGLADESH_OFFSET_MS,
  );
}

class ZKTecoService {
  private baseUrl: string;
  private username: string;
  private password: string;
  private authToken: string | null = null;

  constructor() {
    this.baseUrl = '';
    this.username = '';
    this.password = '';
  }

  setRuntimeConfig(config: { baseUrl?: string; username?: string; password?: string }) {
    const nextBaseUrl = (config.baseUrl ?? this.baseUrl).trim();
    const nextUsername = (config.username ?? this.username).trim();
    const nextPassword = config.password ?? this.password;

    const changed =
      this.baseUrl !== nextBaseUrl ||
      this.username !== nextUsername ||
      this.password !== nextPassword;

    this.baseUrl = nextBaseUrl;
    this.username = nextUsername;
    this.password = nextPassword;

    if (changed) {
      // Credentials or endpoint changed; force re-auth.
      this.authToken = null;
    }
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  /**
   * Authenticate with ZKTeco API and get auth token
   */
  async authenticate(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api-token-auth/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });

      if (!response.ok) {
        console.error('ZKTeco authentication failed:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      this.authToken = data.token;
      return this.authToken;
    } catch (error) {
      console.error('ZKTeco authentication error:', error);
      return null;
    }
  }

  /**
   * Get transactions for a specific employee on a specific date
   */
  async getEmployeeTransactions(empCode: string, date: Date): Promise<ZKTecoTransaction[]> {
    // Ensure we have a valid auth token
    if (!this.authToken) {
      await this.authenticate();
      if (!this.authToken) {
        throw new Error('Failed to authenticate with ZKTeco API');
      }
    }

    // Convert database UTC date to Bangladesh date for ZKTeco query
    // Database stores dates like 2026-02-26T18:00:00.000Z which represents Feb 27 in Bangladesh
    // We need to query ZKTeco for Feb 27, not Feb 26
    const bangladeshDate = new Date(date.getTime() + (6 * 60 * 60 * 1000)); // Add 6 hours for Bangladesh timezone
    const queryDate = format(bangladeshDate, 'yyyy-MM-dd');
    
    console.log(`ZKTeco query: DB date ${date.toISOString()} -> Bangladesh date ${bangladeshDate.toISOString()} -> Query date ${queryDate}`);

    const startTime = `${queryDate} 00:00:00`;
    const endTime = `${queryDate} 23:59:59`;

    const url = `${this.baseUrl}/iclock/api/transactions/?emp_code=${empCode}&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`;

    console.log(`ZKTeco API URL: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.authToken}`,
        },
      });

      if (!response.ok) {
        // If unauthorized, try to re-authenticate once
        if (response.status === 401) {
          console.log('Token expired, re-authenticating...');
          await this.authenticate();
          if (!this.authToken) {
            throw new Error('Failed to re-authenticate with ZKTeco API');
          }

          // Retry with new token
          const retryResponse = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Token ${this.authToken}`,
            },
          });

          if (!retryResponse.ok) {
            throw new Error(`ZKTeco API error: ${retryResponse.status} ${retryResponse.statusText}`);
          }

          const retryData: ZKTecoApiResponse = await retryResponse.json();
          return retryData.data || [];
        }

        throw new Error(`ZKTeco API error: ${response.status} ${response.statusText}`);
      }

      const data: ZKTecoApiResponse = await response.json();
      return data.data || [];
    } catch (error) {
      console.error(`Error fetching ZKTeco data for employee ${empCode} on ${format(date, 'yyyy-MM-dd')}:`, error);
      return [];
    }
  }

  /**
   * Process raw transactions into structured time data
   */
  processTransactions(transactions: ZKTecoTransaction[]): ProcessedTimeData {
    if (!transactions || transactions.length === 0) {
      return {
        actualCheckIn: null,
        actualCheckOut: null,
        actualBreakTime: null,
      };
    }

    // Sort transactions by punch_time to ensure chronological order
    const sortedTransactions = transactions.sort((a, b) => 
      parseZKTecoPunchTime(a.punch_time).getTime() - parseZKTecoPunchTime(b.punch_time).getTime()
    );

    let actualCheckIn: Date | null = null;
    let actualCheckOut: Date | null = null;
    const breakSessions: { breakOut: Date; breakIn: Date | null }[] = [];

    for (const transaction of sortedTransactions) {
      const punchTime = parseZKTecoPunchTime(transaction.punch_time);
      const punchState = transaction.punch_state;

      switch (punchState) {
        case '0': // Check In
          if (!actualCheckIn) {
            actualCheckIn = punchTime; // First check-in of the day
          }
          break;

        case '1': // Check Out
          actualCheckOut = punchTime; // Last check-out of the day (will be overwritten if there are multiple)
          break;

        case '2': // Break Out
          breakSessions.push({ breakOut: punchTime, breakIn: null });
          break;

        case '3': // Break In
          // Find the last break session without a break-in time
          const lastBreakSession = breakSessions.find(session => session.breakIn === null);
          if (lastBreakSession) {
            lastBreakSession.breakIn = punchTime;
          }
          break;
      }
    }

    // Calculate total break time
    let totalBreakMinutes = 0;
    for (const session of breakSessions) {
      if (session.breakIn) {
        const breakDuration = session.breakIn.getTime() - session.breakOut.getTime();
        totalBreakMinutes += Math.floor(breakDuration / (1000 * 60)); // Convert to minutes
      }
    }

    // Format break time as HH:MM
    const actualBreakTime = totalBreakMinutes > 0 
      ? `${Math.floor(totalBreakMinutes / 60).toString().padStart(2, '0')}:${(totalBreakMinutes % 60).toString().padStart(2, '0')}`
      : null;

    return {
      actualCheckIn,
      actualCheckOut,
      actualBreakTime,
    };
  }

  /**
   * Get processed time data for an employee on a specific date
   */
  async getEmployeeTimeData(empCode: string, date: Date): Promise<ProcessedTimeData> {
    try {
      const transactions = await this.getEmployeeTransactions(empCode, date);
      return this.processTransactions(transactions);
    } catch (error) {
      console.error(`Error processing time data for employee ${empCode} on ${format(date, 'yyyy-MM-dd')}:`, error);
      return {
        actualCheckIn: null,
        actualCheckOut: null,
        actualBreakTime: null,
      };
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!(this.baseUrl && this.username && this.password);
  }
}

// Export a singleton instance
export const zkTecoService = new ZKTecoService();