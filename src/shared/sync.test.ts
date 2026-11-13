import { describe, expect, it } from "vitest";
import { makeCatalogue } from "../lib/catalogue";
import { defaultDiners, makePlan, slotIndex } from "../lib/planning";
import {
  freshHousehold,
  householdReducer,
  normalizeHousehold,
  type Household,
  type HouseholdAction,
} from "./household";
import { applyOnServer, receive, visibleState, type ClientSync, type Envelope, type ServerState } from "./sync";

const WEEK = "2026-11-16";
const catalogue = makeCatalogue();

function household(): Household {
  const state = freshHousehold(
    catalogue.swipeable.map((m) => m.id),
    WEEK,
  );
  const slots = makePlan({
    candidates: ["poulet", "cabillaud", "risotto", "omelette", "qlorraine", "lentilles"].map(
      (id) => catalogue.get(id)!,
    ),
    diners: defaultDiners(),
    habits: [],
    preferences: { weeknightMinutes: null, recent: new Map(), ratings: {}, kidsLike: {} },
    lookup: catalogue.get,
    random: () => 0.5,
  });
  return householdReducer(state, { type: "setPlan", week: WEEK, slots, key: "", keepFrom: "2026-01-01" });
}

/** A server and two phones, with messages delivered by hand so tests control the order. */
function network() {
  let server: ServerState = { household: household(), version: 0, recent: [] };
  const phone = (): ClientSync => ({ confirmed: server.household, version: server.version, pending: [] });
  const phones = { a: phone(), b: phone() };
  let n = 0;
  return {
    phones,
    /** The phone acts locally; the action waits to be sent. */
    act(name: "a" | "b", action: HouseholdAction): Envelope {
      const envelope = { id: `${name}-${n++}`, action };
      phones[name] = { ...phones[name], pending: [...phones[name].pending, envelope] };
      return envelope;
    },
    /** The server receives an envelope and broadcasts the result to both phones. */
    deliver(envelope: Envelope) {
      const result = applyOnServer(server, envelope);
      server = result.server;
      for (const name of ["a", "b"] as const) phones[name] = receive(phones[name], result.reply).sync;
      return result.reply;
    },
    server: () => server,
  };
}

describe("sync", () => {
  it("shows a phone's own actions before the server confirms them", () => {
    const net = network();
    net.act("a", { type: "setChecked", week: WEEK, key: "Carottes|g", value: true });
    expect(visibleState(net.phones.a).plans[WEEK]!.checked).toEqual({ "Carottes|g": true });
    expect(visibleState(net.phones.b).plans[WEEK]!.checked).toEqual({});
  });

  it("brings both phones to the server's state, whatever the order", () => {
    const net = network();
    const a1 = net.act("a", { type: "setChecked", week: WEEK, key: "Carottes|g", value: true });
    const b1 = net.act("b", { type: "setChecked", week: WEEK, key: "Oignons|", value: true });
    const b2 = net.act("b", { type: "placeMeal", week: WEEK, slot: slotIndex(0, true), mealId: "hachis" });
    const a2 = net.act("a", { type: "moveMeal", week: WEEK, from: slotIndex(0, true), to: slotIndex(3, true) });
    for (const e of [b1, a1, b2, a2]) net.deliver(e);
    const final = net.server().household;
    expect(visibleState(net.phones.a)).toEqual(final);
    expect(visibleState(net.phones.b)).toEqual(final);
    expect(final.plans[WEEK]!.checked).toEqual({ "Carottes|g": true, "Oignons|": true });
    expect(final.plans[WEEK]!.slots[slotIndex(3, true)]).toMatchObject({ mealId: "hachis" });
    expect(net.phones.a.pending).toEqual([]);
  });

  it("never cancels out two people ticking the same item", () => {
    const net = network();
    const a = net.act("a", { type: "setChecked", week: WEEK, key: "Carottes|g", value: true });
    const b = net.act("b", { type: "setChecked", week: WEEK, key: "Carottes|g", value: true });
    net.deliver(a);
    net.deliver(b);
    expect(net.server().household.plans[WEEK]!.checked).toEqual({ "Carottes|g": true });
  });

  it("applies an action resent after a reconnect only once", () => {
    const net = network();
    const a = net.act("a", { type: "swipe", id: "tartiflette", liked: true });
    expect(net.deliver(a)).toMatchObject({ t: "applied" });
    expect(net.deliver(a)).toEqual({ t: "duplicate", id: a.id });
    expect(net.server().version).toBe(1);
  });

  it("rejects malformed actions without touching the household", () => {
    const net = network();
    const before = net.server();
    expect(applyOnServer(before, { id: "x", action: { type: "dropTables" } }).reply).toEqual({
      t: "rejected",
      id: "x",
    });
    expect(
      applyOnServer(before, { id: "y", action: { type: "setDiners", slot: 99, field: "adults", value: 3 } }).server
        .household,
    ).toEqual(before.household);
  });

  it("asks for a snapshot when it missed a change", () => {
    const sync: ClientSync = { confirmed: household(), version: 3, pending: [] };
    expect(receive(sync, { t: "applied", version: 5, id: "z", action: { type: "reviewNoped" } }).resync).toBe(true);
  });
});

describe("normalizeHousehold", () => {
  it("survives garbage and keeps what is valid", () => {
    expect(normalizeHousehold("nope", WEEK).week).toBe(WEEK);
    const state = normalizeHousehold(
      { liked: ["poulet", "not-a-meal", 3], diners: "x", settings: { weeknightMinutes: "x" } },
      WEEK,
    );
    expect(state.liked).toEqual(["poulet"]);
    expect(state.diners).toHaveLength(14);
    expect(state.settings.weeknightMinutes).toBe(45);
  });
});
