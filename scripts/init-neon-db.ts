import postgres from 'postgres';

async function initializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const sql = postgres(databaseUrl);

  try {
    console.log('Enabling pgcrypto extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    
    console.log('Creating challenges table...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_student_id VARCHAR(255) NOT NULL,
        from_student_name VARCHAR(255) NOT NULL,
        to_student_id VARCHAR(255) NOT NULL,
        to_student_name VARCHAR(255) NOT NULL,
        challenge_id VARCHAR(255) NOT NULL,
        challenge_name VARCHAR(255) NOT NULL,
        challenge_xp INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        from_score INTEGER,
        to_score INTEGER,
        winner_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      )
    `;

    console.log('Creating indexes...');
    
    await sql`CREATE INDEX IF NOT EXISTS idx_challenges_from_student ON challenges(from_student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_challenges_to_student ON challenges(to_student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_challenges_created_at ON challenges(created_at)`;

    console.log('Database initialized successfully!');
    console.log('Tables created: challenges');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

initializeDatabase();
