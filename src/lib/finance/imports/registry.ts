import { financialFileParsers } from "./index";
import { ExistingTransactionMatch, FinancialFileParser, ParsedFinancialDocument, ParserContext } from "./types";
import { markDuplicates } from "./utils";

/**
 * Registro central de parsers de arquivo financeiro. Delegamos a lista base
 * para `financialFileParsers` (index.ts) e mantemos aqui a API pública para
 * quem quiser registrar parsers extras em runtime (ex.: OFX/XLSX no futuro).
 */

class ParserRegistry {
  private extra: FinancialFileParser[] = [];

  register(parser: FinancialFileParser) {
    if (this.list().some((p) => p.name === parser.name)) return;
    this.extra.push(parser);
  }

  unregister(name: string) {
    this.extra = this.extra.filter((p) => p.name !== name);
  }

  list(): FinancialFileParser[] {
    return [...financialFileParsers, ...this.extra];
  }

  async detectAll(context: ParserContext) {
    return Promise.all(
      this.list().map(async (parser) => ({ parser, detection: await parser.canHandle(context) })),
    );
  }

  async pickBest(context: ParserContext) {
    const detections = await this.detectAll(context);
    return detections.sort((a, b) => b.detection.confidence - a.detection.confidence)[0] || null;
  }

  async parse(context: ParserContext, existing: ExistingTransactionMatch[] = []): Promise<ParsedFinancialDocument> {
    const best = await this.pickBest(context);
    if (!best || best.detection.confidence <= 0) {
      throw new Error("Formato ainda não reconhecido. Selecione instituição e tipo manualmente ou cole o texto.");
    }
    const parsed = await best.parser.parse(context);
    return { ...parsed, transactions: markDuplicates(parsed.transactions, existing) };
  }
}

export const parserRegistry = new ParserRegistry();
export type { FinancialFileParser } from "./types";