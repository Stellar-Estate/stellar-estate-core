import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  STELLAR_NETWORK: z.enum(['TESTNET', 'PUBLIC']).default('TESTNET'),
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  PROPERTY_VAULT_CONTRACT_ID: z.string().default('CA3JRBKPQ7V5FZBXT3KUR6HQIZBPQGOWZ7J3WSOUM7LCMUHLJKBWMUAL'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const config = parsed.success ? parsed.data : envSchema.parse({});
