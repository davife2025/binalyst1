/**
 * app/api/skills/byreal/route.ts — Session N4 (new file)
 *
 * Byreal Skills CLI endpoint for the Mantle AI Trading Agent.
 * Part of: The Turing Test Hackathon — Agentic Wallets & Economy track.
 *
 * GET  /api/skills/byreal
 *   → Returns the full skill manifest (for Byreal CLI registration and
 *     skill discovery on skills.byreal.ai)
 *
 * POST /api/skills/byreal
 *   → Execute a skill by name with given input parameters
 *   → Body: { skill: string; input: Record<string, any> }
 *
 * Fully new — does not collide with any existing /api/ routes.
 */

import { NextRequest, NextResponse }  from 'next/server'
import { ByrealSkillHub }             from '@/lib/skills/byreal'
import { rateLimit }                  from '@/lib/rateLimit'

export const dynamic     = 'force-dynamic'
export const maxDuration = 55

// ─────────────────────────────────────────────────────────────────────────────
// GET — skill manifest
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`byreal-manifest:${ip}`, 'market')
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const manifest = ByrealSkillHub.manifest()

  return NextResponse.json({
    success: true,
    manifest,
    endpointUrl: `${req.nextUrl.origin}/api/skills/byreal`,
    skills:      manifest.skills.map(s => ({
      name:        s.name,
      description: s.description,
      tags:        s.tags,
    })),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — execute a skill
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`byreal-execute:${ip}`, 'ai-chat')
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const body = await req.json()
    const { skill, input = {} } = body as { skill: string; input: Record<string, any> }

    if (!skill) {
      return NextResponse.json(
        {
          error: 'skill name required',
          availableSkills: ByrealSkillHub.skills.map(s => s.name),
        },
        { status: 400 },
      )
    }

    // Validate skill exists
    const skillDef = ByrealSkillHub.get(skill)
    if (!skillDef) {
      return NextResponse.json(
        {
          error: `Skill '${skill}' not found`,
          availableSkills: ByrealSkillHub.skills.map(s => s.name),
        },
        { status: 404 },
      )
    }

    // Validate required inputs
    const missing = skillDef.input
      .filter(p => p.required && input[p.name] === undefined)
      .map(p => p.name)

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required input parameters: ${missing.join(', ')}` },
        { status: 400 },
      )
    }

    // Execute the skill
    const result = await ByrealSkillHub.execute(skill, input)

    return NextResponse.json({
      skill,
      ...result,
    })
  } catch (err: any) {
    console.error('[skills/byreal]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
