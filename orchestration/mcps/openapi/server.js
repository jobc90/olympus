#!/usr/bin/env node

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const SwaggerParser = require('@apidevtools/swagger-parser');
const axios = require('axios');

// Store loaded specs
const loadedSpecs = new Map();

const server = new McpServer({
  name: 'openapi-server',
  version: '1.0.0',
});

// Tool: Load OpenAPI/Swagger spec from URL
server.tool(
  'openapi_load',
  'Load and parse an OpenAPI/Swagger specification from a URL',
  {
    url: { type: 'string', description: 'URL to the OpenAPI/Swagger spec (JSON or YAML)' },
    name: { type: 'string', description: 'Name to identify this API (e.g., "dearwell", "petstore")' }
  },
  async ({ url, name }) => {
    try {
      const api = await SwaggerParser.validate(url);
      loadedSpecs.set(name, { url, api });

      const endpoints = [];
      for (const [path, methods] of Object.entries(api.paths || {})) {
        for (const [method, operation] of Object.entries(methods)) {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            endpoints.push({
              method: method.toUpperCase(),
              path,
              summary: operation.summary || '',
              operationId: operation.operationId || ''
            });
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            name,
            title: api.info?.title,
            version: api.info?.version,
            description: api.info?.description,
            baseUrl: api.servers?.[0]?.url || '',
            endpointCount: endpoints.length,
            endpoints: endpoints.slice(0, 50) // First 50 endpoints
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error loading spec: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List all endpoints from loaded spec
server.tool(
  'openapi_list_endpoints',
  'List all endpoints from a loaded OpenAPI spec',
  {
    name: { type: 'string', description: 'Name of the loaded API' },
    filter: { type: 'string', description: 'Optional filter string for path or summary' }
  },
  async ({ name, filter }) => {
    const spec = loadedSpecs.get(name);
    if (!spec) {
      return {
        content: [{ type: 'text', text: `API "${name}" not loaded. Use openapi_load first.` }],
        isError: true
      };
    }

    const endpoints = [];
    for (const [path, methods] of Object.entries(spec.api.paths || {})) {
      for (const [method, operation] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const endpoint = {
            method: method.toUpperCase(),
            path,
            summary: operation.summary || '',
            operationId: operation.operationId || '',
            tags: operation.tags || []
          };

          if (!filter ||
              path.toLowerCase().includes(filter.toLowerCase()) ||
              (operation.summary || '').toLowerCase().includes(filter.toLowerCase())) {
            endpoints.push(endpoint);
          }
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ endpoints, count: endpoints.length }, null, 2)
      }]
    };
  }
);

// Tool: Get endpoint details
server.tool(
  'openapi_get_endpoint',
  'Get detailed information about a specific endpoint',
  {
    name: { type: 'string', description: 'Name of the loaded API' },
    path: { type: 'string', description: 'API endpoint path (e.g., /users/{id})' },
    method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, PATCH)' }
  },
  async ({ name, path, method }) => {
    const spec = loadedSpecs.get(name);
    if (!spec) {
      return {
        content: [{ type: 'text', text: `API "${name}" not loaded.` }],
        isError: true
      };
    }

    const pathObj = spec.api.paths?.[path];
    if (!pathObj) {
      return {
        content: [{ type: 'text', text: `Path "${path}" not found.` }],
        isError: true
      };
    }

    const operation = pathObj[method.toLowerCase()];
    if (!operation) {
      return {
        content: [{ type: 'text', text: `Method ${method} not found for path ${path}.` }],
        isError: true
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          path,
          method: method.toUpperCase(),
          summary: operation.summary,
          description: operation.description,
          operationId: operation.operationId,
          tags: operation.tags,
          parameters: operation.parameters,
          requestBody: operation.requestBody,
          responses: operation.responses,
          security: operation.security
        }, null, 2)
      }]
    };
  }
);

// Tool: Call API endpoint
server.tool(
  'openapi_call',
  'Make an API call to an endpoint',
  {
    name: { type: 'string', description: 'Name of the loaded API' },
    path: { type: 'string', description: 'API endpoint path' },
    method: { type: 'string', description: 'HTTP method' },
    pathParams: { type: 'object', description: 'Path parameters as key-value pairs' },
    queryParams: { type: 'object', description: 'Query parameters as key-value pairs' },
    body: { type: 'object', description: 'Request body (for POST/PUT/PATCH)' },
    headers: { type: 'object', description: 'Additional headers' }
  },
  async ({ name, path, method, pathParams = {}, queryParams = {}, body, headers = {} }) => {
    const spec = loadedSpecs.get(name);
    if (!spec) {
      return {
        content: [{ type: 'text', text: `API "${name}" not loaded.` }],
        isError: true
      };
    }

    try {
      // Build URL with path params
      let url = spec.api.servers?.[0]?.url || '';
      let finalPath = path;
      for (const [key, value] of Object.entries(pathParams)) {
        finalPath = finalPath.replace(`{${key}}`, encodeURIComponent(value));
      }
      url = url + finalPath;

      const response = await axios({
        method: method.toLowerCase(),
        url,
        params: queryParams,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        validateStatus: () => true // Don't throw on error status
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `API call failed: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Generate TypeScript types from schema
server.tool(
  'openapi_generate_types',
  'Generate TypeScript interface definitions from API schemas',
  {
    name: { type: 'string', description: 'Name of the loaded API' },
    schemaName: { type: 'string', description: 'Optional: specific schema name to generate' }
  },
  async ({ name, schemaName }) => {
    const spec = loadedSpecs.get(name);
    if (!spec) {
      return {
        content: [{ type: 'text', text: `API "${name}" not loaded.` }],
        isError: true
      };
    }

    const schemas = spec.api.components?.schemas || {};
    const types = [];

    const generateType = (schema, name) => {
      if (!schema) return `unknown`;

      if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return refName;
      }

      if (schema.type === 'array') {
        return `${generateType(schema.items, name)}[]`;
      }

      if (schema.type === 'object' || schema.properties) {
        const props = [];
        for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
          const required = (schema.required || []).includes(propName);
          const type = generateType(propSchema, propName);
          props.push(`  ${propName}${required ? '' : '?'}: ${type};`);
        }
        return `{\n${props.join('\n')}\n}`;
      }

      switch (schema.type) {
        case 'string': return schema.enum ? schema.enum.map(e => `'${e}'`).join(' | ') : 'string';
        case 'integer':
        case 'number': return 'number';
        case 'boolean': return 'boolean';
        default: return 'unknown';
      }
    };

    for (const [schemaKey, schema] of Object.entries(schemas)) {
      if (!schemaName || schemaName === schemaKey) {
        const typeStr = generateType(schema, schemaKey);
        types.push(`export interface ${schemaKey} ${typeStr}`);
      }
    }

    return {
      content: [{
        type: 'text',
        text: types.join('\n\n')
      }]
    };
  }
);

// Tool: List loaded APIs
server.tool(
  'openapi_list_loaded',
  'List all currently loaded API specifications',
  {},
  async () => {
    const apis = [];
    for (const [name, spec] of loadedSpecs.entries()) {
      apis.push({
        name,
        title: spec.api.info?.title,
        version: spec.api.info?.version,
        url: spec.url
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ loadedApis: apis, count: apis.length }, null, 2)
      }]
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenAPI MCP Server running');
}

main().catch(console.error);
