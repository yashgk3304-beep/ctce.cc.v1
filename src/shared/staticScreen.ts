const HARD_BLOCK = [
  /\b(?:system|popen|WinExec|ShellExecute[AW]?|CreateProcess[AW]?)\s*\(/,
  /\b(?:execl|execle|execlp|execv|execve|execvp|_exec|_wsystem)\s*\(/,
  /\b(?:socket|connect|accept|bind|listen|sendto|recvfrom|WSAStartup)\s*\(/,
  /#\s*include\s*[<"]windows\.h[>"]/i,
  /#\s*include\s*[<"]winsock2?\.h[>"]/i,
];

const FILE_IO = [/\bfopen\s*\(/, /\bremove\s*\(/, /\brename\s*\(/, /\bfreopen\s*\(/];

export interface StaticScreenResult {
  blocked: boolean;
  reasons: string[];
  needsRunAnyway: boolean;
}

export function staticScreen(code: string): StaticScreenResult {
  const reasons: string[] = [];
  for (const re of HARD_BLOCK) {
    if (re.test(code)) reasons.push(`blocked:${re}`);
  }
  const needsRunAnyway = FILE_IO.some((re) => re.test(code));
  return {
    blocked: reasons.length > 0,
    reasons,
    needsRunAnyway,
  };
}

export function isInformationalWarning(warning: string): boolean {
  return /void\s+main|return\s+type\s+of\s+'main'|warning:.*main/i.test(warning);
}
