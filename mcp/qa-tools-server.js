#!/usr/bin/env node
// MCP server that gives a QA agent read-only access to MultiDesk's API and database.
// It talks over stdio, so all logging goes to stderr: stdout belongs to the protocol.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiRequest, getTenantConfig, runDbQuery } from './qaTools.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = process.env.DB_PATH ?? path.join(ROOT_DIR, 'data', 'helpdesk.db');
const BASE_URL = process.env.MULTIDESK_URL ?? 'http://localhost:3000';

const asText = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

// Errors go back to the agent as a tool result, so it can read them and adjust.
const safely = (handler) => async (args) => {
  try {
    return asText(await handler(args));
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
};

const server = new McpServer({ name: 'qa-tools', version: '1.0.0' });

server.registerTool(
  'api_request',
  {
    title: 'Call the MultiDesk REST API',
    description:
      'Sends a request to the MultiDesk API as a given tenant and user and returns the HTTP status and JSON body.',
    inputSchema: {
      method: z.enum(['GET', 'POST', 'PATCH']).default('GET'),
      path: z.string().describe('API path starting with /api/, e.g. /api/tickets?status=open'),
      tenant: z.string().optional().describe('Tenant id sent as the X-Tenant header, e.g. acme or globex'),
      body: z.record(z.string(), z.unknown()).optional().describe('JSON body for POST or PATCH'),
      user: z
        .enum(['admin', 'support1', 'anonymous'])
        .default('admin')
        .describe('Seed user to log in as before the request; anonymous sends no session'),
    },
  },
  safely((args) => apiRequest(BASE_URL, args)),
);

server.registerTool(
  'db_query',
  {
    title: 'Query the MultiDesk database (read-only)',
    description:
      'Runs one read-only SELECT against the SQLite database. Tables: tenants, tenant_settings, tickets, users. Use ? placeholders with params.',
    inputSchema: {
      sql: z.string().describe('A single SELECT statement'),
      params: z.array(z.union([z.string(), z.number()])).default([]),
    },
  },
  safely(({ sql, params }) => runDbQuery(DB_PATH, sql, params)),
);

server.registerTool(
  'tenant_config',
  {
    title: 'Show tenant feature flags',
    description: 'Lists each tenant with its plan and feature flags, so you can tell which tenants a change reaches.',
    inputSchema: {
      tenant: z.string().optional().describe('Tenant id; omit to list all tenants'),
    },
  },
  safely(({ tenant }) => getTenantConfig(DB_PATH, tenant)),
);

await server.connect(new StdioServerTransport());
console.error(`qa-tools MCP ready (api: ${BASE_URL}, db: ${DB_PATH})`);
