/** Fixture-backed mock Gemini answers used when __TEST_HOST__ is true. No live API. */

export const FILL_IN_BLANK_ANSWER = {
  type: 'fill_in_blank' as const,
  final_code: `#include <stdio.h>
int sum(int,int);
int sub(int,int);
int mul(int,int);
int divi(int,int);
void main() {
    int a,b;
    printf("Enter two values : ");
    scanf("%d%d",&a,&b);
    printf("Addition of two values = %d\\n",sum(a,b));
    printf("Subtraction of two values = %d\\n",sub(a,b));
    printf("Multiplication of two values = %d\\n",mul(a,b));
    printf("Division of two values = %d\\n",divi(a,b));
}
int sum(int a, int b) {
    return a + b;
}
int sub(int a, int b) {
    return a - b;
}
int mul(int a, int b) {
    return a * b;
}
int divi(int a, int b) {
    return a / b;
}
`,
  edits: [
    { line: 15, action: 'replace' as const, before: 'int sum( ) {', after: 'int sum(int a, int b) {', hint: 'Add parameters matching the prototype' },
    { line: 16, action: 'replace' as const, before: 'return ;', after: 'return a + b;', hint: 'Return the sum' },
    { line: 18, action: 'replace' as const, before: 'int sub( ) {', after: 'int sub(int a, int b) {', hint: 'Add parameters' },
    { line: 19, action: 'replace' as const, before: 'return ;', after: 'return a - b;', hint: 'Return the difference' },
    { line: 21, action: 'replace' as const, before: 'int mul( ) {', after: 'int mul(int a, int b) {', hint: 'Add parameters' },
    { line: 22, action: 'replace' as const, before: 'return ;', after: 'return a * b;', hint: 'Return the product' },
    { line: 24, action: 'replace' as const, before: 'int divi( ) {', after: 'int divi(int a, int b) {', hint: 'Add parameters' },
    { line: 25, action: 'replace' as const, before: 'return ;', after: 'return a / b;', hint: 'Integer division' },
  ],
  bugs: [],
  explanation: [
    'Fill each empty parameter list with int a, int b.',
    'Return a+b, a-b, a*b and a/b. Do not change void main().',
  ],
  assumptions: ['Integer division as in first-year C.'],
  confidence: 0.86,
};

export const WRONG_DIV_CODE = FILL_IN_BLANK_ANSWER.final_code.replace(
  'return a / b;',
  'return a % b;',
);

export const DEBUG_ANSWER = {
  type: 'debugging' as const,
  final_code: `#include <stdio.h>
int main() {
    int x = 2;
    printf("%d\\n", x + 3);
    return 0;
}
`,
  edits: [
    { line: 4, action: 'replace' as const, before: 'printf("%d\\n", x * 3)', after: 'printf("%d\\n", x + 3);', hint: 'Add semicolon and use +' },
  ],
  bugs: [
    { line: 4, issue: 'Missing semicolon', fix: 'Add ; at end of printf' },
    { line: 4, issue: 'Wrong operator', fix: 'Use + not *' },
  ],
  explanation: ['The program should print 5. Fix the operator and the missing semicolon.'],
  assumptions: [],
  confidence: 0.9,
};

export const COMPLETE_ANSWER = {
  type: 'complete_program' as const,
  final_code: `#include <stdio.h>
int main(void) {
    int n, s = 0;
    scanf("%d", &n);
    while (n > 0) {
        s += n % 10;
        n /= 10;
    }
    printf("%d\\n", s);
    return 0;
}
`,
  edits: [],
  bugs: [],
  explanation: ['Read n, add each digit with n%10, then n/=10 until n is 0.'],
  assumptions: ['Single positive integer on stdin.'],
  confidence: 0.88,
};

export const MCQ_ANSWER = {
  selected: ['B', 'D'],
  options: [
    { id: 'A', correct: false, reason: 'sizeof(char) is 1, not 2' },
    { id: 'B', correct: true, reason: 'sizeof(char) is 1' },
    { id: 'C', correct: false, reason: 'int size is implementation-defined, not always 2' },
    { id: 'D', correct: true, reason: 'NULL is a null pointer constant' },
  ],
  needs_code_run: false,
  code_to_run: null as string | null,
  needs_user_decision: false,
  confidence: 0.8,
};
