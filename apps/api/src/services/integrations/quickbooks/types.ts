export interface QbRef {
  value: string;
  name?: string;
}

export interface QbLine {
  Id?: string;
  Amount: number;
  DetailType?: string;
  AccountBasedExpenseLineDetail?: {
    AccountRef?: QbRef;
  };
  SalesItemLineDetail?: {
    ItemRef?: QbRef;
    TaxCodeRef?: QbRef;
  };
  DepositLineDetail?: {
    AccountRef?: QbRef;
  };
  JournalEntryLineDetail?: {
    PostingType?: 'Debit' | 'Credit';
    AccountRef?: QbRef;
  };
  Description?: string;
}

export interface QbTransaction {
  Id: string;
  TxnDate: string;
  DocNumber?: string;
  PrivateNote?: string;
  TotalAmt?: number;
  Line?: QbLine[];

  CustomerRef?: QbRef;
  VendorRef?: QbRef;
  EntityRef?: QbRef;

  MetaData?: {
    CreateTime?: string;
    LastUpdatedTime?: string;
  };
}

export type QbTransactionType =
  | 'Purchase'
  | 'Bill'
  | 'BillPayment'
  | 'VendorCredit'
  | 'Invoice'
  | 'Payment'
  | 'SalesReceipt'
  | 'Deposit'
  | 'CreditMemo'
  | 'RefundReceipt'
  | 'JournalEntry'
  | 'Transfer'
  | 'Estimate';

export interface NormalizedQbRow {
  sourceType: 'quickbooks';
  sourceId: string;
  date: Date;
  amount: string;
  category: string;
  parentCategory: 'Income' | 'Expenses' | 'Other';
  label: string | null;
  metadata: {
    qb_id: string;
    txnType: QbTransactionType;
    docNumber: string | null;
    memo: string | null;
    accountCode: string | null;
  };
}
