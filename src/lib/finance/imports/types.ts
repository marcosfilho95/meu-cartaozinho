export type InstitutionCode = "NUBANK" | "MERCADO_PAGO" | "PICPAY" | "C6" | "UNKNOWN";

export type FinancialDocumentType = "BANK_STATEMENT" | "CREDIT_CARD_STATEMENT" | "UNKNOWN";

export type FinancialFileFormat = "CSV" | "OFX" | "XLSX" | "PDF_TEXT" | "TXT" | "UNKNOWN";

export type TransactionDirection = "CREDIT" | "DEBIT";

export type ParserContext = {
  fileName: string;
  mimeType?: string;
  fileText: string;
  fileHash?: string;
  manualInstitution?: InstitutionCode;
  manualDocumentType?: FinancialDocumentType;
  manualFormat?: FinancialFileFormat;
};

export type ParserDetectionResult = {
  confidence: number;
  institution: InstitutionCode;
  documentType: FinancialDocumentType;
  format: FinancialFileFormat;
  reason: string;
};

export type NormalizedTransaction = {
  externalId?: string;
  institution: InstitutionCode;
  sourceType: "BANK_ACCOUNT" | "CREDIT_CARD";
  sourceAccountId?: string;
  transactionDate: string;
  postingDate?: string;
  descriptionOriginal: string;
  descriptionNormalized: string;
  merchantName?: string;
  amount: string;
  direction: TransactionDirection;
  transactionType?: string;
  installmentCurrent?: number;
  installmentTotal?: number;
  currency: "BRL";
  confidence: number;
  categorySuggestion?: string;
  fingerprint: string;
  possibleDuplicate?: boolean;
  possibleInternalTransfer?: boolean;
  metadata: Record<string, unknown>;
};

export type ParsedFinancialDocument = {
  parserName: string;
  detection: ParserDetectionResult;
  period?: { start?: string; end?: string };
  totals?: {
    initialBalance?: string;
    totalCredits?: string;
    totalDebits?: string;
    finalBalance?: string;
  };
  transactions: NormalizedTransaction[];
  warnings: string[];
  metadata: Record<string, unknown>;
};

export interface FinancialFileParser {
  name: string;
  canHandle(context: ParserContext): Promise<ParserDetectionResult>;
  parse(context: ParserContext): Promise<ParsedFinancialDocument>;
}

export type ExistingTransactionMatch = {
  id: string;
  external_id?: string | null;
  fingerprint?: string | null;
  amount: number;
  transaction_date: string;
  source?: string | null;
  type: "income" | "expense" | "transfer";
};

