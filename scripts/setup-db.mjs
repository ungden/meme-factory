#!/usr/bin/env node

/**
 * Meme Factory — Database Setup Script
 * 
 * This script reads supabase-schema.sql and outputs instructions
 * for running it on your Supabase project.
 * 
 * Usage: node scripts/setup-db.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "..", "supabase-schema.sql");
const sql = readFileSync(schemaPath, "utf8");

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kpsmwylkmdrmbunzboua.supabase.co";
const projectRef = projectUrl.replace("https://", "").replace(".supabase.co", "");

console.log(`
╔══════════════════════════════════════════════╗
║   Meme Factory — Database Setup              ║
╚══════════════════════════════════════════════╝

Project: ${projectRef}

📋 Open this URL in your browser:
   ${projectUrl.replace(projectRef + '.supabase.co', 'supabase.com/dashboard/project/' + projectRef + '/sql/new')}

Then paste the SQL below and click "Run":
${"─".repeat(50)}

${sql}

${"─".repeat(50)}

After running, verify at:
   ${projectUrl.replace(projectRef + '.supabase.co', 'supabase.com/dashboard/project/' + projectRef + '/editor')}

You should see 4 tables: projects, characters, character_poses, memes
`);
