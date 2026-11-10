import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClient } from "./client";
import { createAuthStore } from "../auth/store";
import type { ApiClient as Client } from "./client";
import type { User } from "../types";
import { signInWithSupabasePassword } from "./supabase-password";

afterEach(()=>vi.unstubAllGlobals());
describe("provider password sign in",()=>{
 it("sends credentials only to fixed Supabase project and returns only access proof",async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({access_token:"proof",refresh_token:"never-persist"})});vi.stubGlobal("fetch",fetcher);
  expect(await signInWithSupabasePassword({enabled:true,url:"https://qcpgqehqjescuwqhnmie.supabase.co",publishable_key:"sb_publishable_test"},"a@example.com","password-value")).toBe("proof");
  const [url,init]=fetcher.mock.calls[0]!;expect(url).toBe("https://qcpgqehqjescuwqhnmie.supabase.co/auth/v1/token?grant_type=password");
  expect(JSON.parse(init.body)).toEqual({email:"a@example.com",password:"password-value"});expect(init.credentials).toBe("omit");expect(init.headers.apikey).toBe("sb_publishable_test");
 });
 it("does not send passwords to arbitrary configured hosts",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  await expect(signInWithSupabasePassword({enabled:true,url:"https://other.example",publishable_key:"sb_publishable_test"},"a@example.com","secret")).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
 it("does not expose provider errors or malformed responses",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({error_description:"private provider detail"})}));
  await expect(signInWithSupabasePassword({enabled:true,url:"https://qcpgqehqjescuwqhnmie.supabase.co",publishable_key:"sb_publishable_test"},"a@example.com","secret")).rejects.toThrow("Sign-in failed");
 });
});

describe("native password exchange boundary", () => {
  it("sends only provider access proof to morechat.co, never password/refresh/user metadata", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, url: "https://qcpgqehqjescuwqhnmie.supabase.co", publishable_key: "sb_publishable_test" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-proof", refresh_token: "provider-refresh", user: { id: "untrusted" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "native-token", user: { id: "native-user" } })));
    vi.stubGlobal("fetch", fetcher);
    const client = new ApiClient("http://localhost:8080");
    await client.loginWithPassword("person@example.com", "test-password");
    expect(fetcher.mock.calls[2]![0]).toBe("http://localhost:8080/auth/supabase");
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({ access_token: "provider-proof" });
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ email: "person@example.com", password: "test-password" });
  });
  it("cookie mode stores no password or bearer token", async () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    const user = { id: "native-user", name: "Person", email: "person@example.com" } as User;
    const api = { loginWithPassword: vi.fn().mockResolvedValue({ token: "native-token", user }), setToken: vi.fn() } as unknown as Client;
    const store = createAuthStore({ api, storage, cookieAuth: true });
    await store.getState().loginWithPassword("person@example.com", "test-password");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(api.setToken).not.toHaveBeenCalled();
    expect(store.getState().user).toEqual(user);
    expect(store.getState().status).toBe("authenticated");
  });
});

