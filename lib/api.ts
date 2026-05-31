import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
});

// Players
export const fetchPlayerProfile = (playerId: string) =>
  api.get(`/players/${playerId}`).then((r) => r.data);

export const fetchPlayerComments = (playerId: string) =>
  api.get(`/players/${playerId}/comments`).then((r) => r.data);

// Scouts
export const fetchScoutProfile = (scoutId: string) =>
  api.get(`/scouts/${scoutId}`).then((r) => r.data);

export const fetchScoutContacts = (scoutId: string) =>
  api.get(`/scouts/${scoutId}/contacts`).then((r) => r.data);

// Chat
export const fetchChatHistory = (roomId: string) =>
  api.get(`/chat/${roomId}`).then((r) => r.data);

export const postChatMessage = (
  roomId: string,
  message: string,
  sender: string,
) => api.post(`/chat/${roomId}`, { message, sender }).then((r) => r.data);

export default api;
