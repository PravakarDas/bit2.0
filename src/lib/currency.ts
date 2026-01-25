export const CURRENCY_SYMBOL = "৳";

export function formatCurrency(amount: number) {
    return `${CURRENCY_SYMBOL}${amount.toLocaleString("en-BD")}`;
}
