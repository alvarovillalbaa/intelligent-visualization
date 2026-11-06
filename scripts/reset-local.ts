// Shared PostgreSQL and user objects cannot be safely reset by a generic command.
console.error("Automatic local reset is disabled. First export to a NEW private backup directory with data:export and verify it with data:verify. To start fresh, explicitly provision a separate local PostgreSQL database and empty storage directory, set LOCAL_DATABASE_URL and LOCAL_STORAGE_DIR, then run setup:local. This command deletes no database, schema or stored files.")
process.exitCode = 1
