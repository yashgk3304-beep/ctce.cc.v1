const HARD = [
  /\b(?:system|popen|WinExec|ShellExecute[AW]?|CreateProcess[AW]?)\s*\(/,
  /\b(?:execl|execle|execlp|execv|execve|execvp|_exec|_wsystem)\s*\(/,
  /\b(?:socket|connect|accept|bind|listen|sendto|recvfrom|WSAStartup)\s*\(/,
  /#\s*include\s*[<"]windows\.h[>"]/i,
  /#\s*include\s*[<"]winsock2?\.h[>"]/i,
];
const FILE_IO = [/\bfopen\s*\(/, /\bremove\s*\(/, /\brename\s*\(/, /\bfreopen\s*\(/];

export function staticScreen(code) {
  const reasons = [];
  for (const re of HARD) {
    if (re.test(code)) reasons.push(String(re));
  }
  return {
    blocked: reasons.length > 0,
    reasons,
    needsRunAnyway: FILE_IO.some((re) => re.test(code)),
  };
}

export function informationalWarning(w) {
  return /void\s+main|return type of 'main'|warning:.*main/i.test(w);
}
