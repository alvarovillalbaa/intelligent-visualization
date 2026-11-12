import { hostedLifecycleUpgradeSql } from "@/packages/provider-supabase/lifecycle-upgrade"

if (process.argv.slice(2).join(" ") !== "--print-supabase-sql") throw new Error("Usage: tsx scripts/lifecycle-migration.ts --print-supabase-sql (prints SQL; does not connect or apply)")
process.stdout.write(hostedLifecycleUpgradeSql())
