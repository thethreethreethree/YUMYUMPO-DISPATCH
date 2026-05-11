// Thin data API. Uses Supabase if configured; otherwise falls back to mock data.
import { supabase, HAS_SUPABASE } from "./supabase.js";
import { RIDERS, REQUESTS, ZONES, VEHICLES } from "./mock-data.js";

export const enums = { ZONES, VEHICLES };

export async function fetchRiders(filters = {}) {
  if (HAS_SUPABASE) {
    let q = supabase.from("riders").select("*").order("rating", { ascending: false });
    if (filters.status) q = q.eq("availability_status", filters.status);
    if (filters.vehicle) q = q.eq("vehicle_type", filters.vehicle);
    if (filters.zone) q = q.contains("delivery_zones", [filters.zone]);
    if (filters.verifiedOnly) q = q.eq("verification_status", "verified");
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  return RIDERS.filter(r =>
    (!filters.status || r.status === filters.status) &&
    (!filters.vehicle || r.vehicle === filters.vehicle) &&
    (!filters.zone || r.zones.includes(filters.zone)) &&
    (!filters.verifiedOnly || r.verified)
  );
}

export async function fetchRider(id) {
  if (HAS_SUPABASE) {
    const { data, error } = await supabase.from("riders").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }
  return RIDERS.find(r => r.id === id);
}

export async function createDeliveryRequest(payload) {
  if (HAS_SUPABASE) {
    const { data, error } = await supabase.from("delivery_requests").insert(payload).select().single();
    if (error) throw error;
    return data;
  }
  const row = { id: "d" + Date.now(), status: "Available", created: new Date().toISOString(), ...payload };
  REQUESTS.unshift(row);
  return row;
}

export async function fetchRequests(filters = {}) {
  if (HAS_SUPABASE) {
    let q = supabase.from("delivery_requests").select("*").order("created_at", { ascending: false });
    if (filters.restaurant) q = q.eq("restaurant_id", filters.restaurant);
    if (filters.rider) q = q.eq("rider_id", filters.rider);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  return REQUESTS;
}

export async function togglePreferred(restaurantId, riderId) {
  const key = "preferred_" + (restaurantId || "demo");
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const i = list.indexOf(riderId);
  if (i === -1) list.push(riderId); else list.splice(i, 1);
  localStorage.setItem(key, JSON.stringify(list));
  if (HAS_SUPABASE && restaurantId) {
    if (i === -1) await supabase.from("preferred_riders").insert({ restaurant_id: restaurantId, rider_id: riderId });
    else await supabase.from("preferred_riders").delete().match({ restaurant_id: restaurantId, rider_id: riderId });
  }
  return list;
}

export function getPreferred(restaurantId) {
  return JSON.parse(localStorage.getItem("preferred_" + (restaurantId || "demo")) || "[]");
}

export async function submitRating(payload) {
  if (HAS_SUPABASE) {
    const { error } = await supabase.from("rider_ratings").insert(payload);
    if (error) throw error;
  }
  // local fallback - just succeed
  return true;
}

export async function submitVerification(payload) {
  if (HAS_SUPABASE) {
    const { error } = await supabase.from("rider_verifications").insert(payload);
    if (error) throw error;
  }
  return true;
}
