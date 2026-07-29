# TRI-CONTEXT

> **A different way to chat with AI.**
>
> Edit the context, not the conversation.

TRI-CONTEXT is a lightweight interface for AI conversations that lets you **move messages between three independent contexts while preserving a single chronological timeline**.

Instead of constantly starting new chats, copying conversations, or asking the model to ignore previous discussion, TRI-CONTEXT lets you decide exactly what the model sees on the next request.

---

## Why?

Current AI chat interfaces treat **conversation history** and **model context** as the same thing.

They aren't.

You often want to:

- Keep an idea for later.
- Explore a tangent.
- Archive a useful answer.
- Remove irrelevant discussion from the active context.

Today, the only options are usually:

- Start a new chat.
- Copy and paste.
- Summarize.
- Delete messages.
- Hope the model ignores what you don't want.

All of those require reusing tokens that have already been processed.

TRI-CONTEXT takes a different approach.

---

# The Core Idea

There are three columns:

- **Archive**
- **Main Thread**
- **Branch**

Only the **active column** is sent to the AI model.

Everything else remains available, searchable, movable, and preserved—but costs **zero additional prompt tokens** until you decide to bring it back.

---

# Features

## Shared Timeline

Every message exists on one shared chronological timeline.

Moving a message between columns **does not change history**.

It only changes which context that message belongs to.

---

## Explicit Context Management

Instead of asking:

> "Ignore everything above..."

You simply move irrelevant messages out of the active context.

The model never receives them.

---

## Drag-and-Drop Conversation Editing

Move messages between contexts with a single click or drag.

- Archive useful responses
- Branch experiments
- Remove distractions
- Organize research

without copying or deleting anything.

---

## Preserve History

History is never destroyed.

You can always see exactly when something happened.

TRI-CONTEXT separates:

- **History**
- **Context**

instead of treating them as the same thing.

---

## Import / Export

Save an entire workspace as a single file.

When reloaded, every message returns to:

- the correct column
- the correct chronological position

allowing long-term projects to be paused and resumed exactly where they left off.

---

## Bring Your Own Model

Uses OpenRouter's `openrouter/auto`.

Choose whatever model you prefer from your OpenRouter account.

No application changes required.

---

# Why This Matters

Large language models repeatedly consume the same information because current interfaces encourage users to:

- restart chats
- copy conversations
- summarize previous work
- paste context back into new conversations

Every one of those actions requires tokens that have already been generated.

TRI-CONTEXT reduces this by allowing users to **reorganize existing context instead of recreating it.**

Rather than treating conversations as immutable transcripts, TRI-CONTEXT treats them as editable workspaces.

---

# Philosophy

Conversation history is an archive.

Context is a view of that archive.

Those are different things.

TRI-CONTEXT lets the user decide what belongs in the next inference while preserving everything that came before.

---

# Example Workflow

Imagine you're discussing a programming project.

During the conversation you discover:

- a bug
- an unrelated design idea
- a useful code snippet
- an interesting future feature

Instead of letting all of those permanently accumulate inside one massive context:

- Move the bug discussion to Archive.
- Move the future feature into Branch.
- Keep the main implementation discussion in Main Thread.

The next AI response only sees what is actually relevant.

---

# Current Features

- Three independent contexts
- Shared chronological timeline
- Drag-and-drop message movement
- Explicit context selection
- Import / Export workspaces
- Token estimation
- Speech recognition
- Text-to-speech
- Local browser storage
- OpenRouter integration

---

# Technology

- React
- TypeScript
- OpenRouter API
- LocalStorage
- Web Speech API

Single-file application.

No backend required.

---

# Future Ideas

- Multiple saved workspaces
- Search
- Tags
- Message pinning
- Keyboard shortcuts
- Markdown export
- Additional context management tools

---

# Vision

TRI-CONTEXT is an experiment in treating AI conversations as something users can actively edit rather than passively accumulate.

The goal isn't simply to branch chats.

The goal is to give users direct control over what an AI remembers next.

History remains intact.

Context becomes intentional.

---

## License

Apache 2.0
