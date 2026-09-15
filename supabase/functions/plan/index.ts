import { authenticate, preflight, response } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = preflight(req); if (cors) return cors;
  if (req.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const auth = await authenticate(req); if ('error' in auth) return auth.error;
  let body: { contestId?: string };
  try { body = await req.json(); } catch { return response({ error: 'invalid_json' }, 400); }
  const contestId = String(body.contestId || '').trim();
  if (!contestId) return response({ error: 'contest_id_required' }, 400);
  const [contestResult, cadernosResult] = await Promise.all([
    auth.admin.from('study_contests').select('*').eq('user_id', auth.userId).eq('contest_id', contestId).single(),
    auth.admin.from('study_cadernos').select('*').eq('user_id', auth.userId).eq('contest_id', contestId)
  ]);
  if (contestResult.error || cadernosResult.error || !contestResult.data) return response({ error: 'contest_not_found' }, 404);
  const contest = contestResult.data, target = Number(contest.target_accuracy || 100), minQuestions = Number(contest.min_questions || 10);
  const sections = { specific: Number(contest.specific_weight || 1), general: Number(contest.general_weight || 1) };
  const now = Date.now();
  const ranked = (cadernosResult.data || []).map((item: Record<string, unknown>) => {
    const attempted = Number(item.attempted || 0), correct = Number(item.correct || 0), raw = attempted ? 100 * correct / attempted : 0;
    const smooth = attempted ? 100 * (correct + 5) / (attempted + 10) : 0;
    const age = item.last_attempt_at ? Math.min(1, Math.max(0, (now - new Date(String(item.last_attempt_at)).getTime()) / 1209600000)) : 1;
    const repeat = Math.min(1, Number(item.repeat_errors || 0) / 5), subject = item.subject === 'general' ? 'general' : 'specific';
    const risk = attempted < minQuestions ? sections[subject] * .3 : sections[subject] * Math.max(0, target - smooth) / 100 * (1 + age + repeat);
    return { id: item.caderno_id, name: item.name, subject, attempted, raw, smooth, risk, reason: attempted < minQuestions ? `faltam ${minQuestions - attempted} questões para medir` : `${smooth.toFixed(1)}% estimado, peso ${sections[subject]}` };
  }).sort((a: { risk: number }, b: { risk: number }) => b.risk - a.risk).slice(0, 6);
  const decision = { algorithmVersion: 'nexame-risk-v1', generatedAt: new Date().toISOString(), targetAccuracy: target, recommended: ranked };
  await auth.admin.from('study_plan_decisions').insert({ user_id: auth.userId, contest_id: contestId, plan_date: new Date().toISOString().slice(0, 10), algorithm_version: decision.algorithmVersion, inputs: { target, minQuestions, sections }, decisions: decision });
  return response(decision);
});
