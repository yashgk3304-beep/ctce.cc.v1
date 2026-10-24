import { describe, expect, it } from 'vitest';
import { classifyStage1, classifyWithRules, countPatternHits, ruleMatches } from '../../src/content/classifier/stage1';
import type { ClassifierStage1Input } from '../../src/content/classifier/stage1';
import { STAGE1_RULES } from '../../src/content/classifier/rules';
import { loadFixture } from '../helpers/dom';
import { extractQuestion } from '../../src/content/extractors/question';
import { extractEditor } from '../../src/content/extractors/editor';
import { pageProbe } from '../../src/content/probe';

function base(over: Partial<ClassifierStage1Input> = {}): ClassifierStage1Input {
  return {
    probeKind: 'coding',
    urlPath: '/practice/sum',
    heading: 'Sum',
    statement: 'Read two integers.',
    editorText: '#include <stdio.h>\nint main(){}',
    ...over,
  };
}

describe('classifyStage1', () => {
  const cases: Array<{ name: string; input: ClassifierStage1Input; type: string }> = [
    { name: 'quiz url', input: base({ urlPath: '/course/quiz/1', probeKind: 'quiz' }), type: 'quiz' },
    { name: 'assessment url', input: base({ urlPath: '/assessment/x' }), type: 'quiz' },
    { name: 'exam url', input: base({ urlPath: '/exam/final' }), type: 'quiz' },
    { name: 'mcq url', input: base({ urlPath: '/mcq/set' }), type: 'quiz' },
    { name: 'quiz heading', input: base({ heading: 'Quiz: Intro' }), type: 'quiz' },
    { name: 'quiz probe', input: base({ probeKind: 'quiz', statement: 'Pick one' }), type: 'quiz' },
    { name: 'fill statement', input: base({ statement: 'Fill in the blank below' }), type: 'fill_in_blank' },
    { name: 'fill missing', input: base({ statement: 'Fill in the missing semicolon' }), type: 'fill_in_blank' },
    { name: 'complete code below', input: base({ statement: 'Complete the code below' }), type: 'fill_in_blank' },
    { name: 'insert missing', input: base({ statement: 'Insert the missing return' }), type: 'fill_in_blank' },
    { name: 'underscores', input: base({ statement: 'Value is ____' }), type: 'fill_in_blank' },
    { name: 'todo editor', input: base({ editorText: 'int x;\n// TODO: read x' }), type: 'fill_in_blank' },
    { name: 'block todo', input: base({ editorText: '/* TODO fix */' }), type: 'fill_in_blank' },
    { name: 'your code here', input: base({ editorText: '/* YOUR CODE HERE */' }), type: 'fill_in_blank' },
    { name: 'fill in editor', input: base({ editorText: 'FILL IN HERE' }), type: 'fill_in_blank' },
    { name: 'underscores editor', input: base({ editorText: 'int __;' }), type: 'fill_in_blank' },
    { name: 'debug statement', input: base({ statement: 'Debug the program' }), type: 'debugging' },
    { name: 'find bug', input: base({ statement: 'Find the bug in this code' }), type: 'debugging' },
    { name: 'fix error', input: base({ statement: 'Fix the error in the loop' }), type: 'debugging' },
    { name: 'incorrect output', input: base({ statement: 'It produces incorrect output' }), type: 'debugging' },
    { name: 'does not compile', input: base({ statement: 'Program does not compile' }), type: 'debugging' },
    { name: 'bug comment', input: base({ editorText: '// BUG here' }), type: 'debugging' },
    { name: 'fixme', input: base({ editorText: 'FIX ME' }), type: 'debugging' },
    { name: 'select all', input: base({ statement: 'Select all correct answers' }), type: 'mcq_multi' },
    { name: 'choose all apply', input: base({ statement: 'Choose all that apply' }), type: 'mcq_multi' },
    { name: 'multiple answers', input: base({ statement: 'Multiple answers may be correct' }), type: 'mcq_multi' },
    { name: 'mark all', input: base({ statement: 'Mark all correct options' }), type: 'mcq_multi' },
    { name: 'checkbox hint', input: base({ htmlHint: '<input type="checkbox" />' }), type: 'mcq_multi' },
    { name: 'choose one', input: base({ statement: 'Choose one option' }), type: 'mcq_single' },
    { name: 'select one', input: base({ statement: 'Select one answer' }), type: 'mcq_single' },
    { name: 'single correct', input: base({ statement: 'Single correct answer only' }), type: 'mcq_single' },
    { name: 'which following', input: base({ statement: 'Which of the following is true?' }), type: 'mcq_single' },
    { name: 'radio hint', input: base({ htmlHint: 'type="radio"' }), type: 'mcq_single' },
    { name: 'plain coding', input: base({ statement: 'Write a program to add numbers', editorText: '#include<stdio.h>' }), type: 'complete_program' },
    { name: 'hello world', input: base({ statement: 'Print hello world', editorText: 'int main(){return 0;}' }), type: 'complete_program' },
    { name: 'empty editor scaffold', input: base({ editorText: 'int main(){\n\n}' }), type: 'complete_program' },
    { name: 'arrays topic', input: base({ heading: 'Arrays', statement: 'Implement bubble sort' }), type: 'complete_program' },
    { name: 'pointers topic', input: base({ statement: 'Use pointers to swap' }), type: 'complete_program' },
    { name: 'file io', input: base({ statement: 'Read from stdin until EOF' }), type: 'complete_program' },
    { name: 'recursion', input: base({ statement: 'Implement factorial recursively' }), type: 'complete_program' },
    { name: 'structs', input: base({ statement: 'Define a struct Student' }), type: 'complete_program' },
  ];

  it.each(cases)('$name → $type', ({ input, type }) => {
    expect(classifyStage1(input).type).toBe(type);
  });

  it('screenshot fill_in_blank fixture', () => {
    const doc = loadFixture('fill-in-blank.html');
    const probe = pageProbe(doc);
    expect(probe.kind).toBe('coding');
    const q = extractQuestion(doc);
    const ed = extractEditor(doc);
    const result = classifyStage1({
      probeKind: probe.kind,
      urlPath: '/practice/sum',
      heading: q.value?.heading ?? '',
      statement: q.value?.statement ?? '',
      editorText: ed.value?.text ?? '',
    });
    expect(result.type).toBe('fill_in_blank');
    expect(result.stage).toBe(1);
  });

  it('countPatternHits respects multiple patterns', () => {
    expect(countPatternHits('abc TODO xyz', [/TODO/, /missing/])).toBe(1);
    expect(countPatternHits('fill in the blank', [/fill/i, /blank/i])).toBe(2);
  });

  it('ruleMatches fallback always true', () => {
    const fallback = STAGE1_RULES.find((r) => r.fallback)!;
    expect(ruleMatches(fallback, base()).matched).toBe(true);
  });

  it('custom rule ordering', () => {
    const onlyQuiz = STAGE1_RULES.filter((r) => r.type === 'quiz');
    expect(classifyWithRules(base({ urlPath: '/quiz/1' }), onlyQuiz).type).toBe('quiz');
  });
});
