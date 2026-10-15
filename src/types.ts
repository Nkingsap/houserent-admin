export type Role = 'tenant' | 'owner';

export const ROLES: Role[] = ['tenant', 'owner'];

/** A person in the system, merged from auth.users + profiles + the legacy public.users mirror. */
export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: Role | null;
  created_at: string | null;
  lastSignInAt: string | null;
  emailConfirmed: boolean | null;
  hasProfile: boolean;
  hasLegacyRow: boolean;
}

export interface ListingRow {
  id: string;
  owner_id: string;
  title: string;
  price: number;
  type: string;
  city: string;
  address: string;
  available: boolean;
  images: string[] | null;
  created_at: string;
  owner_name: string | null;
}

export interface Stats {
  tenants: number;
  owners: number;
  users: number;
  listings: number;
  availableListings: number;
  unavailableListings: number;
  favorites: number;
  newSignups: number;
}

export interface UserInput {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: Role;
}
