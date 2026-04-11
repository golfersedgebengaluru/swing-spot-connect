import { vi } from "vitest";

// Reusable chainable query builder mock
export function createQueryMock(resolvedData: any = [], resolvedError: any = null) {
  const result = { data: resolvedData, error: resolvedError };

  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: vi.fn((resolve: any) => resolve(result)),
  };

  // Make the chain itself thenable so `await supabase.from(...).select(...)` works
  chain[Symbol.for("thenableResult")] = result;
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  });

  return chain;
}

// Mock the supabase client module
export function mockSupabase(overrides: Record<string, any> = {}): any {
  const fromMocks: Record<string, any> = {};

  const mock: any = {
    from: vi.fn((table: string) => {
      if (fromMocks[table]) return fromMocks[table];
      return createQueryMock();
    }),
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    ...overrides,
  };

  mock._mockTable = (table: string, queryMock: any) => {
    fromMocks[table] = queryMock;
  };

  return mock;
}
