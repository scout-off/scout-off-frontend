import axios, { AxiosError } from "axios";
import type { ChatMessage } from "@/types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  headers: { "Content-Type": "application/json" },
});

// ── Players ────────────────────────────────────────────────────────────────────
export const fetchPlayerProfile = (playerId: string) =>
  api.get(`/players/${playerId}`).then((r) => r.data);

export const fetchPlayerComments = (playerId: string) =>
  api.get(`/players/${playerId}/comments`).then((r) => r.data);

// ── Scouts ────────────────────────────────────────────────────────────────────
export const fetchScoutProfile = (scoutId: string) =>
  api.get(`/scouts/${scoutId}`).then((r) => r.data);

export const fetchScoutContacts = (scoutId: string) =>
  api.get(`/scouts/${scoutId}/contacts`).then((r) => r.data);

// ── Request/Response interfaces ────────────────────────────────────────────────
export interface GetMessagesRequest {
  scoutID: string;
  playerID: string;
}

export interface GetMessagesResponse {
  messages: ChatMessage[];
}

export interface SendMessageRequest {
  scoutID: string;
  playerID: string;
  text: string;
}

export interface SendMessageResponse {
  message: ChatMessage;
}


// ── Chat ───────────────────────────────────────────────────────────────────────

function handleUnauthorized() {
  // Clear any stored auth/session data if applicable
  try {
    // Project-wide session/auth handling mechanism (if any consumer listens)
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  } catch {
    // ignore (e.g. SSR)
  }

  // Redirect to home
  if (typeof window !== "undefined") {
    window.location.assign("/");
  }
}

/**
 * Fetches all messages between a scout and a player.
 *
 * @throws {Error} If the request fails (except for 404, which returns empty array)
 */
export async function getMessages(
  scoutID: string,
  playerID: string
): Promise<ChatMessage[]> {
  try {
    const response = await api.get<GetMessagesResponse>(
      `/chat/${scoutID}/${playerID}`
    );

    return response.data.messages ?? [];
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.response?.status === 404) {
      return [];
    }

    if (axiosError.response?.status === 401) {
      handleUnauthorized();
      throw new Error("Unauthorized: Session expired");
    }

    throw error;
  }
}

/**
 * Sends a message from a scout to a player.
 *
 * @throws {Error} If the request fails
 */
export async function sendMessage(
  scoutID: string,
  playerID: string,
  text: string
): Promise<ChatMessage> {
  try {
    const response = await api.post<SendMessageResponse>(
      `/chat/${scoutID}/${playerID}`,
      { text }
    );

    return response.data.message;
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.response?.status === 401) {
      handleUnauthorized();
      throw new Error("Unauthorized: Session expired");
    }

    throw error;
  }
}

export default api;

