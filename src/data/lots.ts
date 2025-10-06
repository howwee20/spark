export interface Lot {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const msuLots: Lot[] = [
  // --- MAJOR PARKING RAMPS ---
  { id: 'ramp_1', name: 'Ramp 1 / Wharton Center',     lat: 42.7247, lng: -84.4883 }, // VERIFY
  { id: 'ramp_3', name: 'Ramp 3 / Shaw Hall',          lat: 42.7262, lng: -84.4777 }, // VERIFY
  { id: 'ramp_5', name: 'Ramp 5 / Comm Arts',          lat: 42.7214, lng: -84.4678 }, // VERIFY
  { id: 'ramp_6', name: 'Ramp 6 / Grand River Ave',    lat: 42.7368, lng: -84.4828 }, // VERIFY

  // --- KEY STADIUM & ARENA LOTS ---
  { id: 'lot_79',  name: 'Lot 79 / Spartan Stadium',   lat: 42.7260, lng: -84.4870 }, // VERIFY
  { id: 'lot_63',  name: 'Lot 63 / Breslin Center',    lat: 42.7280, lng: -84.4920 }, // VERIFY
  { id: 'lot_124', name: 'Lot 124 / Munn Arena',       lat: 42.7272, lng: -84.4905 }, // VERIFY

  // --- CORE ACADEMIC AREA LOTS (NORTH CAMPUS) ---
  { id: 'lot_39',  name: 'Lot 39 / MSU Union',         lat: 42.7347, lng: -84.4802 }, // VERIFY
  { id: 'lot_62',  name: 'Lot 62 / IM Sports West',    lat: 42.7311, lng: -84.4862 }, // VERIFY
  { id: 'lot_15',  name: 'Lot 15 / International Center', lat: 42.7275, lng: -84.4788 }, // VERIFY

  // --- CORE RESIDENTIAL AREA LOTS (SOUTH CAMPUS) ---
  { id: 'lot_89',  name: 'Lot 89 / Wilson & Case Halls', lat: 42.7190, lng: -84.4830 }, // VERIFY
  { id: 'lot_83',  name: 'Lot 83 / Business College',  lat: 42.7230, lng: -84.4810 }, // VERIFY

  // --- MAJOR COMMUTER & PERIMETER LOTS ---
  { id: 'lot_91',  name: 'Lot 91 / Commuter Lot (Service Rd)', lat: 42.7160, lng: -84.4780 }, // VERIFY
  { id: 'lot_80',  name: 'Lot 80 / Vet Med',           lat: 42.7120, lng: -84.4690 }, // VERIFY
];
