import { getUsers } from "@/actions/user.actions";
import EmployeeNotesBoard from "@/components/admin/EmployeeNotesBoard";

export default async function ManagerEmployeeNotesPage() {
  const users = await getUsers();

  return <EmployeeNotesBoard users={users} employeeProfileBasePath="/manager/employees" />;
}
