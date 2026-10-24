import { db, safeQuery, isDatabaseConfigured } from "../client";

/*
 * THE ADMIN DASHBOARD'S STUDENT PICTURE, in one statement.
 *
 *   stages   every student by the stage they are at, with the same rules as
 *            getAdvisorBoard in ./portal.ts (and lib/portal/stage.ts). Keep the
 *            three in step if a rule changes.
 *   plans    how many chose one-time or installments (payment_plans, 047)
 *   agents   the sales agents with the most students, for the leaderboard
 *   daily    the last 30 days, per day: sign-ups, receipts sent, fees verified
 *            and applications submitted (the sparklines on the figure cards)
 *   totals   the headline figures
 *   recent   the newest students, with their stage, plan and agent
 *
 * Every number is a real count; nothing is seeded or estimated.
 */

export type StudentInsights = {
  stages: Record<string, number>;
  plans: { one_time: number; installments: number; none: number };
  agents: { id: string; name: string; code: string | null; students: number; verified: number }[];
  daily: { day: string; signups: number; receipts: number; verified: number; applications: number }[];
  totals: { students: number; verified: number; awaitingFee: number; submitted: number; agents: number };
  recent: { id: string; name: string; created_at: string; stage: string; plan: string | null; agent: string | null; avatar_v: number | null }[];
};

const EMPTY: StudentInsights = {
  stages: {},
  plans: { one_time: 0, installments: 0, none: 0 },
  agents: [],
  daily: [],
  totals: { students: 0, verified: 0, awaitingFee: 0, submitted: 0, agents: 0 },
  recent: [],
};

export async function getStudentInsights(): Promise<StudentInsights> {
  if (!isDatabaseConfigured()) return EMPTY;
  return safeQuery(async () => {
    const [r] = await db()`
      WITH s AS (
        SELECT u.id, u.sales_agent_id, u.name, u.created_at,
          CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::int END AS avatar_v,
          CASE
            WHEN f.live IS NULL AND f.rejected > 0 THEN 'fee_rejected'
            WHEN f.live IS NULL THEN 'fee_due'
            WHEN f.live = 'submitted' THEN 'fee_review'
            WHEN i.status IS NULL OR i.status IN ('draft', 'returned') THEN 'application'
            WHEN k.n = 0 THEN 'consent_due'
            ELSE 'complete'
          END AS stage,
          f.live = 'verified' AS verified
        FROM users u
        LEFT JOIN LATERAL (
          SELECT
            (SELECT status::text FROM fee_submissions
              WHERE user_id = u.id AND status IN ('submitted','verified')
              ORDER BY (status = 'verified') DESC LIMIT 1) AS live,
            (SELECT count(*)::int FROM fee_submissions
              WHERE user_id = u.id AND status = 'rejected') AS rejected
        ) f ON TRUE
        LEFT JOIN LATERAL (
          SELECT status::text AS status FROM intake_forms
          WHERE user_id = u.id AND pathway = 'study' LIMIT 1
        ) i ON TRUE
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS n FROM consents
          WHERE user_id = u.id AND kind IN ('student_undertaking', 'consultant_student')
        ) k ON TRUE
        WHERE u.role = 'student'
      ),
      days AS (
        SELECT generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS d
      )
      SELECT
        COALESCE((SELECT json_object_agg(stage, n) FROM (SELECT stage, count(*)::int AS n FROM s GROUP BY stage) x), '{}'::json) AS stages,
        json_build_object(
          'one_time', (SELECT count(*)::int FROM payment_plans p JOIN s ON s.id = p.user_id WHERE p.plan = 'one_time'),
          'installments', (SELECT count(*)::int FROM payment_plans p JOIN s ON s.id = p.user_id WHERE p.plan = 'installments'),
          'none', (SELECT count(*)::int FROM s WHERE NOT EXISTS (SELECT 1 FROM payment_plans p WHERE p.user_id = s.id))
        ) AS plans,
        COALESCE((
          SELECT json_agg(a ORDER BY a.students DESC, a.name) FROM (
            SELECT g.id, g.name, g.crm_code AS code,
              count(s.id)::int AS students,
              count(s.id) FILTER (WHERE s.verified)::int AS verified
            FROM users g JOIN s ON s.sales_agent_id = g.id
            WHERE g.role = 'sales'
            GROUP BY g.id
            ORDER BY count(s.id) DESC, g.name
            LIMIT 6
          ) a
        ), '[]'::json) AS agents,
        COALESCE((
          SELECT json_agg(x ORDER BY x.day) FROM (
            SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT count(*)::int FROM users u WHERE u.role = 'student'
                AND u.created_at >= d AND u.created_at < d + interval '1 day') AS signups,
              (SELECT count(*)::int FROM fee_submissions f
                WHERE f.created_at >= d AND f.created_at < d + interval '1 day') AS receipts,
              (SELECT count(*)::int FROM fee_submissions f WHERE f.status = 'verified'
                AND f.reviewed_at >= d AND f.reviewed_at < d + interval '1 day') AS verified,
              (SELECT count(*)::int FROM intake_forms i
                WHERE i.submitted_at >= d AND i.submitted_at < d + interval '1 day') AS applications
            FROM days
          ) x
        ), '[]'::json) AS daily,
        json_build_object(
          'students', (SELECT count(*)::int FROM s),
          'verified', (SELECT count(*)::int FROM s WHERE s.verified),
          'awaitingFee', (SELECT count(*)::int FROM s WHERE s.stage IN ('fee_due', 'fee_rejected')),
          'submitted', (SELECT count(*)::int FROM s WHERE s.stage IN ('consent_due', 'complete')),
          'agents', (SELECT count(*)::int FROM users WHERE role = 'sales')
        ) AS totals,
        COALESCE((
          SELECT json_agg(x ORDER BY x.created_at DESC) FROM (
            SELECT s.id, s.name, s.created_at, s.stage, s.avatar_v, p.plan, g.name AS agent
            FROM s
            LEFT JOIN payment_plans p ON p.user_id = s.id
            LEFT JOIN users g ON g.id = s.sales_agent_id
            ORDER BY s.created_at DESC
            LIMIT 8
          ) x
        ), '[]'::json) AS recent
      FROM (SELECT 1) one
    `;
    return {
      stages: (r?.stages ?? {}) as Record<string, number>,
      plans: (r?.plans ?? EMPTY.plans) as StudentInsights["plans"],
      agents: (r?.agents ?? []) as StudentInsights["agents"],
      daily: (r?.daily ?? []) as StudentInsights["daily"],
      totals: (r?.totals ?? EMPTY.totals) as StudentInsights["totals"],
      recent: (r?.recent ?? []) as StudentInsights["recent"],
    };
  }, EMPTY);
}
