export const RC64_2A_CHROMIUM_LAUNCH_POLICY_SCHEMA='iberfit.rc64.2a.chromium-launch-policy.v1';

export function managedChromiumSandboxArgs({
  platform=process.platform,
  githubActions=process.env.GITHUB_ACTIONS,
  host,
}={}){
  const githubLinux=platform==='linux'&&githubActions==='true';
  if(!githubLinux)return Object.freeze([]);

  if(host!=='127.0.0.1'){
    throw new Error('RC64_2A_GITHUB_LINUX_NO_SANDBOX_REQUIRES_IPV4_LOOPBACK');
  }

  return Object.freeze(['--no-sandbox']);
}
