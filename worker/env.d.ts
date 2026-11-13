interface Env {
  HOUSEHOLD: DurableObjectNamespace<import("./household").Household>;
  ASSETS: Fetcher;
}
