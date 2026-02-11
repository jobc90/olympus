import { Command } from 'commander';
import { spawn } from 'node:child_process';

export const curlCommand = new Command('curl')
  .description('curl wrapper with auto API key injection')
  .argument('[path]', 'API path (e.g. /api/cli/run) or full URL')
  .allowUnknownOption()
  .helpOption(false)
  .action(async (path: string | undefined, _opts: unknown, cmd: Command) => {
    const { loadConfig } = await import('@olympus-dev/gateway');
    const config = loadConfig();

    const baseUrl = config.gatewayUrl || `http://${config.gatewayHost}:${config.gatewayPort}`;
    const apiKey = config.apiKey;

    // Build URL: if path starts with /, prepend base URL
    let url = path ?? '';
    if (url.startsWith('/')) {
      url = `${baseUrl}${url}`;
    } else if (!url.startsWith('http')) {
      url = `${baseUrl}/${url}`;
    }

    // Collect extra args passed after the path
    const extraArgs = cmd.args.slice(1);

    const args = [
      '-H', `Authorization: Bearer ${apiKey}`,
      '-H', 'Content-Type: application/json',
      url,
      ...extraArgs,
    ];

    const child = spawn('curl', args, { stdio: 'inherit' });
    child.on('close', (code) => process.exit(code ?? 0));
  });
