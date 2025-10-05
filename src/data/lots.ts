export type LotDefinition = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export const LOTS: LotDefinition[] = [
  { id: 'lot-7', name: 'Lot 7 (IM East)', lat: 42.72452, lng: -84.47234 },
  { id: 'lot-15', name: 'Lot 15 (Wharton)', lat: 42.72951, lng: -84.48335 },
  { id: 'lot-21', name: 'Lot 21 (Spartan Stadium)', lat: 42.72818, lng: -84.48201 },
  { id: 'lot-23', name: 'Lot 23 (STEM)', lat: 42.73097, lng: -84.4782 },
  { id: 'lot-24', name: 'Lot 24 (Breslin)', lat: 42.72899, lng: -84.49544 },
  { id: 'lot-25', name: 'Lot 25 (IM West)', lat: 42.72495, lng: -84.48796 },
  { id: 'lot-27', name: 'Lot 27 (Engineering)', lat: 42.72644, lng: -84.47886 },
  { id: 'lot-30', name: 'Lot 30 (Clinical Center)', lat: 42.73263, lng: -84.47874 },
  { id: 'lot-39', name: 'Lot 39 (Auditorium)', lat: 42.73203, lng: -84.48476 },
  { id: 'lot-41', name: 'Lot 41 (Agriculture Hall)', lat: 42.72599, lng: -84.48002 },
  { id: 'lot-53', name: 'Lot 53 (Shaw Ramp)', lat: 42.7268, lng: -84.47938 },
  { id: 'lot-60', name: 'Lot 60 (Hannah)', lat: 42.73458, lng: -84.49248 },
  { id: 'lot-62w', name: 'Lot 62W (Bogue Street)', lat: 42.73003, lng: -84.47075 },
  { id: 'lot-63', name: 'Lot 63 (CATA)', lat: 42.73246, lng: -84.47469 },
  { id: 'lot-67', name: 'Lot 67 (Kellogg)', lat: 42.73215, lng: -84.48595 },
  { id: 'lot-75', name: 'Lot 75 (Brody)', lat: 42.73351, lng: -84.49783 },
  { id: 'lot-79', name: 'Lot 79 (Munn)', lat: 42.72729, lng: -84.48989 },
  { id: 'lot-91', name: 'Lot 91 (Service Rd)', lat: 42.72176, lng: -84.48538 },
  { id: 'lot-100', name: 'Lot 100 (Research)', lat: 42.73576, lng: -84.47542 },
];
