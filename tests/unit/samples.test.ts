import { describe, expect, it } from 'vitest';
import { extractSamples } from '../../src/content/extractors/samples';
import { documentFromHtml } from '../helpers/dom';

describe('extractSamples', () => {
  const layouts: Array<{ name: string; html: string; status: string; input?: string }> = [
    {
      name: 'labelled blocks with pre',
      html: `<div class="sample-test-cases"><span>Input</span><pre>10 5</pre><span>Output</span><pre>15</pre></div>`,
      status: 'ok',
      input: '10 5',
    },
    {
      name: 'collapsed accordion',
      html: `<div class="sample-test-cases"><button aria-expanded="false">Sample Test Cases</button><div hidden></div></div>`,
      status: 'collapsed',
    },
    {
      name: 'details closed',
      html: `<details class="sample-cases"><summary>Sample Test Cases</summary></details>`,
      status: 'collapsed',
    },
    {
      name: 'table layout',
      html: `<table><tr><th>Input</th><td>1 2</td></tr><tr><th>Output</th><td>3</td></tr></table>`,
      status: 'ok',
      input: '1 2',
    },
    {
      name: 'test cases tab panel',
      html: `<button role="tab" aria-controls="tc1">Test cases</button><div id="tc1"><label>Input</label><pre>7</pre><label>Output</label><pre>7</pre></div>`,
      status: 'ok',
      input: '7',
    },
    {
      name: 'two pres fallback',
      html: `<section><pre>hello</pre><pre>HELLO</pre></section>`,
      status: 'ok',
      input: 'hello',
    },
    {
      name: 'missing io',
      html: `<div>No samples here</div>`,
      status: 'missing',
    },
    {
      name: 'unparsed partial',
      html: `<div class="sample-test-cases"><button aria-expanded="true">Sample Test Cases</button><div><span>Input</span><pre></pre><span>Output</span><pre></pre></div></div>`,
      status: 'unparsed',
    },
    {
      name: 'stdin label',
      html: `<div><strong>Stdin</strong><pre>9 1</pre><strong>Stdout</strong><pre>10</pre></div>`,
      status: 'ok',
      input: '9 1',
    },
    {
      name: 'expected output label',
      html: `<div><p>Expected Output:</p><pre>0</pre><p>Input:</p><pre>0</pre></div>`,
      status: 'ok',
    },
    {
      name: 'nbsp preserved',
      html: `<div><span>Input</span><pre>10\u00A05</pre><span>Output</span><pre>15</pre></div>`,
      status: 'ok',
      input: '10 5',
    },
  ];

  it.each(layouts)('$name → $status', ({ html, status, input }) => {
    const doc = documentFromHtml(`<body>${html}</body>`);
    const res = extractSamples(doc);
    expect(res.value?.status).toBe(status);
    if (input) {
      expect(res.value?.tests[0]?.input).toBe(input);
    }
  });
});
