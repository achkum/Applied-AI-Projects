-- Migration: 0003_household_dependant_role
-- Adds DEPENDANT to the member_role enum.
-- Dependants are added by admins and have no login identity.

ALTER TYPE "member_role" ADD VALUE IF NOT EXISTS 'DEPENDANT';
