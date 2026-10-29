import { openApiSpec } from './openapi.js';

export function getSwaggerHtml(): string {
  const specJson = JSON.stringify(openApiSpec);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stellar Estate Core API — Interactive Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background-color: #070a13; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f1f5f9; }
    .topbar { display: none !important; }
    .swagger-ui { color: #f1f5f9; }
    .swagger-ui .info .title { color: #f59e0b; }
    .swagger-ui .info p, .swagger-ui .info li { color: #94a3b8; }
    .swagger-ui .opblock { border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
    .swagger-ui .opblock .opblock-summary-operation-id, .swagger-ui .opblock .opblock-summary-path { color: #e2e8f0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        spec: ${specJson},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
}
