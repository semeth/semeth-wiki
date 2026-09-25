interface D1Meta {
  last_row_id: number;
}

interface D1Result<T> {
  results: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<{ success: boolean; meta: D1Meta }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
