export interface ExpenseCategory {
  key: string;
  id: number;
  categoryName: string;
  categoryDescription?: string;
  imageUrl?: string;
  created: number;
  modified: number;
  selected: boolean;
  synced: boolean;
  uid: string;
}

export interface PaymentMethod {
  key: string;
  paymentMethod: string;
  selected: boolean;
  synced: boolean;
  uid: string;
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  {
    key: 'payment_method_cash_1316797_rrrrr',
    paymentMethod: 'Cash',
    selected: false,
    synced: true,
    uid: ''
  },
  {
    key: 'payment_method_debit_card_5765763_rrrrr',
    paymentMethod: 'Debit Card',
    selected: false,
    synced: true,
    uid: ''
  },
  {
    key: 'payment_method_credit_card_974673_rrrrr',
    paymentMethod: 'Credit Card',
    selected: false,
    synced: true,
    uid: ''
  },
  {
    key: 'payment_method_other_6546332_rrrrr',
    paymentMethod: 'Other',
    selected: false,
    synced: true,
    uid: ''
  },
];

export const DEFAULT_PAYMENT_METHOD_MAP = new Map<string, string>(
  DEFAULT_PAYMENT_METHODS.map((item) => [item.key, item.paymentMethod]),
);

export interface Expense {
  key: string;
  id: number;
  amount: number;
  spentOn: string;
  categoryKey: string; // Maps to ExpenseCategory.key
  paymentMethods: string[]; // Array of PaymentMethod.key
  created: number; // Epoch timestamp
  modified: number;
  synced: boolean;
  uid: string;
}

// Helper interface for joined/mapped expense view in dashboard UI
export interface FormattedExpense extends Expense {
  categoryName?: string;
  paymentMethodNames?: string[];
}
