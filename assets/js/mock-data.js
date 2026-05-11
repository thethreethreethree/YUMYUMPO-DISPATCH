// Mock dataset used when Supabase isn't configured yet.
// Replace with live queries via /assets/js/api.js once your project is connected.

export const ZONES = [
  "El Nido Town Proper",
  "Corong-Corong",
  "Las Cabanas",
  "General Luna",
  "Cebu IT Park",
  "Lahug",
  "Poblacion",
  "BGC",
];

export const VEHICLES = ["motorcycle", "bicycle", "scooter", "car", "walking"];

export const RIDERS = [
  {
    id: "r1", name: "Mark Villanueva", photo: "https://i.pravatar.cc/240?img=12",
    vehicle: "motorcycle", zones: ["El Nido Town Proper","Corong-Corong"],
    status: "online", rating: 4.9, completed: 312, verified: true,
    phone: "+639170000001", whatsapp: "639170000001",
    base_fee: 60, per_km_fee: 12, preferred_count: 28,
  },
  {
    id: "r2", name: "Jasmine Cruz", photo: "https://i.pravatar.cc/240?img=47",
    vehicle: "scooter", zones: ["Cebu IT Park","Lahug"],
    status: "available", rating: 4.8, completed: 198, verified: true,
    phone: "+639170000002", whatsapp: "639170000002",
    base_fee: 70, per_km_fee: 14, preferred_count: 21,
  },
  {
    id: "r3", name: "Ramon dela Peña", photo: "https://i.pravatar.cc/240?img=33",
    vehicle: "motorcycle", zones: ["Poblacion","BGC"],
    status: "online", rating: 4.7, completed: 540, verified: true,
    phone: "+639170000003", whatsapp: "639170000003",
    base_fee: 80, per_km_fee: 15, preferred_count: 64,
  },
  {
    id: "r4", name: "Liza Mañalac", photo: "https://i.pravatar.cc/240?img=44",
    vehicle: "bicycle", zones: ["General Luna"],
    status: "busy", rating: 4.6, completed: 87, verified: true,
    phone: "+639170000004", whatsapp: "639170000004",
    base_fee: 50, per_km_fee: 10, preferred_count: 11,
  },
  {
    id: "r5", name: "Carlo Bautista", photo: "https://i.pravatar.cc/240?img=15",
    vehicle: "car", zones: ["BGC","Poblacion"],
    status: "online", rating: 5.0, completed: 411, verified: true,
    phone: "+639170000005", whatsapp: "639170000005",
    base_fee: 150, per_km_fee: 25, preferred_count: 92,
  },
  {
    id: "r6", name: "Nikki Reyes", photo: "https://i.pravatar.cc/240?img=22",
    vehicle: "walking", zones: ["Las Cabanas"],
    status: "available", rating: 4.5, completed: 24, verified: false,
    phone: "+639170000006", whatsapp: "639170000006",
    base_fee: 40, per_km_fee: 0, preferred_count: 3,
  },
  {
    id: "r7", name: "Diego Santos", photo: "https://i.pravatar.cc/240?img=68",
    vehicle: "motorcycle", zones: ["Cebu IT Park"],
    status: "offline", rating: 4.8, completed: 230, verified: true,
    phone: "+639170000007", whatsapp: "639170000007",
    base_fee: 65, per_km_fee: 13, preferred_count: 19,
  },
  {
    id: "r8", name: "Aira Quintos", photo: "https://i.pravatar.cc/240?img=49",
    vehicle: "scooter", zones: ["El Nido Town Proper","Las Cabanas"],
    status: "online", rating: 4.9, completed: 156, verified: true,
    phone: "+639170000008", whatsapp: "639170000008",
    base_fee: 60, per_km_fee: 12, preferred_count: 34,
  },
];

export const REQUESTS = [
  { id:"d1", restaurant:"Tasteful Kitchen", zone:"El Nido Town Proper", pickup:"Tasteful Kitchen, Calle Hama", dropoff:"Las Cabanas Beach", status:"Delivered", rider:"r1", created:"2026-05-11 19:22" },
  { id:"d2", restaurant:"Tasteful Kitchen", zone:"Corong-Corong", pickup:"Tasteful Kitchen", dropoff:"Marina Garden", status:"Picked Up", rider:"r8", created:"2026-05-12 11:08" },
  { id:"d3", restaurant:"Tasteful Kitchen", zone:"Las Cabanas", pickup:"Tasteful Kitchen", dropoff:"Sundowner Villa", status:"Accepted", rider:"r6", created:"2026-05-12 12:15" },
  { id:"d4", restaurant:"Tasteful Kitchen", zone:"El Nido Town Proper", pickup:"Tasteful Kitchen", dropoff:"Hama St 14", status:"Available", rider:null, created:"2026-05-12 13:02" },
];
