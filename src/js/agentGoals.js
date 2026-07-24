/**
 * Persistent goals so agents don't thrash every second and honor promises.
 *
 * Priorities (higher wins):
 *  100 CRITICAL  — about to starve
 *   85 PROMISE   — agreed with the human player
 *   50 SURVIVAL  — food / work when needed
 *   25 ROUTINE   — normal plans
 *   10 IDLE      — wander
 */

export const PRIORITY = {
  CRITICAL: 100,
  PROMISE: 85,
  SURVIVAL: 50,
  ROUTINE: 25,
  IDLE: 10
};

export function hasActiveGoal(agent) {
  return Boolean(agent.goal && performance.now() < agent.goal.expiresAt);
}

export function clearGoal(agent, reason = "") {
  if (agent.goal && reason) {
    agent.lastResult = `goal done: ${reason}`;
  }
  agent.goal = null;
}

/**
 * Set a goal only if it outranks (or equals) the current one,
 * unless force is true.
 */
export function setGoal(agent, partial, force = false) {
  const now = performance.now();
  const durationMs = partial.durationMs ?? 75_000;
  const next = {
    type: partial.type || "wander",
    place: partial.place || null,
    withPlayer: Boolean(partial.withPlayer),
    withAgentName: partial.withAgentName || null,
    label: partial.label || partial.type || "goal",
    priority: partial.priority ?? PRIORITY.ROUTINE,
    source: partial.source || "brain",
    expiresAt: now + durationMs,
    holdAfterArrive: partial.holdAfterArrive ?? 12,
    arrivedAt: null
  };

  if (
    !force &&
    hasActiveGoal(agent) &&
    agent.goal.priority > next.priority
  ) {
    return false;
  }

  agent.goal = next;
  agent.currentAction = next.label;
  return true;
}

/**
 * Parse human chat into a social/action commitment for the agent.
 */
export function parsePlayerIntent(text) {
  const t = (text || "").toLowerCase();

  if (
    /dinner|lunch|restaurant|eat with|grab (a )?bite|food together|go out to eat/.test(
      t
    )
  ) {
    return {
      type: "go_to",
      place: "restaurant",
      withPlayer: true,
      label: "dinner with you",
      priority: PRIORITY.PROMISE,
      durationMs: 120_000,
      holdAfterArrive: 25,
      agreeLine: "Yes — let's go to a restaurant. I'll head there now."
    };
  }

  if (/market|grocery|get food|buy food/.test(t) && /me|with|us|together|come/.test(t)) {
    return {
      type: "go_to",
      place: "grocery",
      withPlayer: true,
      label: "market with you",
      priority: PRIORITY.PROMISE,
      durationMs: 100_000,
      holdAfterArrive: 20,
      agreeLine: "Okay, I'll meet you at the market."
    };
  }

  if (/follow me|come with me|walk with me|stay with me|hang out/.test(t)) {
    return {
      type: "follow_player",
      place: null,
      withPlayer: true,
      label: "following you",
      priority: PRIORITY.PROMISE,
      durationMs: 90_000,
      holdAfterArrive: 0,
      agreeLine: "Sure, I'll stick with you for a bit."
    };
  }

  if (/wait here|stay here|don't go|wait for me/.test(t)) {
    return {
      type: "wait",
      place: null,
      withPlayer: true,
      label: "waiting for you",
      priority: PRIORITY.PROMISE,
      durationMs: 60_000,
      holdAfterArrive: 60,
      agreeLine: "Alright, I'll wait right here."
    };
  }

  if (/go to work|get (a )?job|go work|work now/.test(t)) {
    return {
      type: "work_plan",
      place: null,
      withPlayer: false,
      label: "heading to work",
      priority: PRIORITY.PROMISE,
      durationMs: 90_000,
      agreeLine: "Okay — I'll go take care of work."
    };
  }

  if (/marriage|marry me|wedding|marriage hall/.test(t)) {
    return {
      type: "go_to",
      place: "marriage_hall",
      withPlayer: false,
      label: "marriage hall",
      priority: PRIORITY.PROMISE,
      durationMs: 100_000,
      agreeLine: "I'll head to the Marriage Hall."
    };
  }

  if (/gun shop|buy (a )?gun|get armed/.test(t)) {
    return {
      type: "go_to",
      place: "gunshop",
      withPlayer: /with me|together|come/.test(t),
      label: "gun shop",
      priority: PRIORITY.PROMISE,
      durationMs: 90_000,
      agreeLine: "I'll go toward the gun shop."
    };
  }

  if (/bank|rob|heist/.test(t)) {
    return {
      type: "go_to",
      place: "bank",
      withPlayer: /with me|together|come/.test(t),
      label: "bank",
      priority: PRIORITY.PROMISE,
      durationMs: 90_000,
      agreeLine: "Bank it is — risky though."
    };
  }

  if (/meet me at|go to the|head to/.test(t)) {
    if (/restaurant|dinner/.test(t)) {
      return parsePlayerIntent("dinner with me");
    }
    if (/market|grocery/.test(t)) {
      return parsePlayerIntent("market with me");
    }
    if (/school|office|gym|barber/.test(t)) {
      const place = (t.match(/school|office|gym|barber/) || [])[0];
      return {
        type: "go_to",
        place,
        withPlayer: true,
        label: `meet at ${place}`,
        priority: PRIORITY.PROMISE,
        durationMs: 100_000,
        agreeLine: `Okay, I'll go to the ${place}.`
      };
    }
  }

  return null;
}

export function isRefusal(reply) {
  if (!reply) {
    return true;
  }
  return /\b(no|nope|can't|cannot|won't|will not|not now|busy|maybe later|don't want|not interested|sorry,? i can'?t)\b/i.test(
    reply
  );
}

/**
 * Critical survival need that may interrupt a promise.
 */
export function criticalNeed(agent) {
  if (agent.stats.hunger < 18) {
    return {
      type: "go_to",
      place: agent.stats.money >= 7 ? "grocery" : "restaurant",
      label: "emergency food",
      priority: PRIORITY.CRITICAL,
      durationMs: 90_000,
      withPlayer: false
    };
  }
  return null;
}
