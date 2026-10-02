import { useEffect, useId, useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import type { Candidate } from "@/lib/game";
import { scoutingStoryFor } from "@/lib/scouting-stories";
import "./PersonalConversation.css";

export type PersonalConversationProps = { candidate: Pick<Candidate, "id" | "name" | "bio" | "hook">; disabled?: boolean; className?: string };
type Topic = "work" | "background";
const QUESTIONS: { id: Topic; text: string }[] = [{ id: "work", text: "Tell me about your work." }, { id: "background", text: "What brought you here?" }];

/** Quiet, optional conversation. Reading does not spend actions or grant hiring evidence. */
export default function PersonalConversation({ candidate, disabled = false, className = "" }: PersonalConversationProps) {
  const [topic, setTopic] = useState<Topic | null>(null), id = useId();
  const story = scoutingStoryFor(candidate);
  useEffect(() => { setTopic(null); }, [candidate.id]);
  if (!story) return null;
  const response = topic ? story[topic] : [];
  return <section className={`personal-conversation ${className}`} aria-label={`A personal conversation with ${candidate.name}`}>
    <div className="personal-conversation-heading"><MessageCircle size={15} strokeWidth={1.5}/><span>A MOMENT TO LISTEN</span></div>
    <div className="personal-conversation-questions">{QUESTIONS.map(question => <button key={question.id} type="button" disabled={disabled} aria-expanded={topic === question.id} aria-pressed={topic === question.id} aria-controls={`${id}-answer`} onClick={() => setTopic(current => current === question.id ? null : question.id)}><span>“{question.text}”</span><ChevronDown size={14} className={topic === question.id ? "selected" : ""}/></button>)}</div>
    <div id={`${id}-answer`} className="personal-conversation-answer" aria-live="polite" aria-atomic="true">{topic && <><span className="personal-conversation-speaker">{candidate.name.split(" ")[0]} <i/> {story.title}</span><blockquote>{response.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</blockquote></>}</div>
    {!topic && !disabled && <p className="personal-conversation-invitation">There’s time for a conversation.</p>}
  </section>;
}
