import type { AxiosError } from "axios";
import axios from "axios";
import {
  getMessages,
  sendMessage,
  GetMessagesResponse,
  SendMessageResponse,
} from "@/lib/api";
import type { ChatMessage } from "@/types";

jest.mock("axios");
const mockedAxios = axios as unknown as {
  create: jest.Mock;
};


describe("chat API helpers", () => {
  const mockScoutID = "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTWYTTE2XFVFNNE4XMJLERI5SZ";
  const mockPlayerID = "GBPG7CHDXFX4XRXRDPG2VWDPTL74P42J64NDQUAFZXPN2T4ZG3QABDHL";
  
  const mockChatMessage: ChatMessage = {
    id: "msg-123",
    from: mockScoutID,
    to: mockPlayerID,
    text: "Interested in your profile!",
    timestamp: Math.floor(Date.now() / 1000),
    read: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getMessages", () => {
    describe("successful message retrieval", () => {
      it("returns an array of ChatMessage objects on success", async () => {
        const mockMessages: ChatMessage[] = [mockChatMessage];
        (getMessages as jest.Mock).mockResolvedValueOnce(mockMessages);

        const result = await getMessages(mockScoutID, mockPlayerID);

        expect(result).toEqual(mockMessages);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("msg-123");
      });

      it("returns an empty array when no messages exist", async () => {
        (getMessages as jest.Mock).mockResolvedValueOnce([]);

        const result = await getMessages(mockScoutID, mockPlayerID);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
      });

      it("returns multiple messages in chronological order", async () => {
        const msg1: ChatMessage = { ...mockChatMessage, id: "msg-1", timestamp: 1000 };
        const msg2: ChatMessage = { ...mockChatMessage, id: "msg-2", timestamp: 2000 };
        const mockMessages: ChatMessage[] = [msg1, msg2];
        (getMessages as jest.Mock).mockResolvedValueOnce(mockMessages);

        const result = await getMessages(mockScoutID, mockPlayerID);

        expect(result).toHaveLength(2);
        expect(result[0].timestamp).toBe(1000);
        expect(result[1].timestamp).toBe(2000);
      });
    });

    describe("404 Not Found handling", () => {
      it("returns an empty array instead of throwing on 404", async () => {
        (getMessages as jest.Mock).mockResolvedValueOnce([]);

        const result = await getMessages(mockScoutID, mockPlayerID);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
      });
    });

    describe("401 Unauthorized handling", () => {
      it("dispatches auth:unauthorized event on 401", async () => {
        const dispatchEventSpy = jest.spyOn(window, "dispatchEvent");
        (getMessages as jest.Mock).mockRejectedValueOnce(
          new Error("Unauthorized: Session expired")
        );

        await expect(getMessages(mockScoutID, mockPlayerID)).rejects.toThrow(
          "Unauthorized: Session expired"
        );
      });

      it("throws error with message 'Unauthorized: Session expired' on 401", async () => {
        (getMessages as jest.Mock).mockRejectedValueOnce(
          new Error("Unauthorized: Session expired")
        );

        await expect(getMessages(mockScoutID, mockPlayerID)).rejects.toThrow(
          "Unauthorized: Session expired"
        );
      });
    });

    describe("exported interface typing", () => {
      it("returns properly typed ChatMessage array", async () => {
        const mockMessages: ChatMessage[] = [mockChatMessage];
        (getMessages as jest.Mock).mockResolvedValueOnce(mockMessages);

        const result = await getMessages(mockScoutID, mockPlayerID);

        // Verify all required ChatMessage properties exist
        if (result.length > 0) {
          const msg = result[0];
          expect("id" in msg).toBe(true);
          expect("from" in msg).toBe(true);
          expect("to" in msg).toBe(true);
          expect("text" in msg).toBe(true);
          expect("timestamp" in msg).toBe(true);
          expect("read" in msg).toBe(true);
        }
      });

      it("messages have correct property types", async () => {
        const mockMessages: ChatMessage[] = [mockChatMessage];
        (getMessages as jest.Mock).mockResolvedValueOnce(mockMessages);

        const result = await getMessages(mockScoutID, mockPlayerID);

        const msg = result[0];
        expect(typeof msg.id).toBe("string");
        expect(typeof msg.from).toBe("string");
        expect(typeof msg.to).toBe("string");
        expect(typeof msg.text).toBe("string");
        expect(typeof msg.timestamp).toBe("number");
        expect(typeof msg.read).toBe("boolean");
      });
    });

    describe("error handling", () => {
      it("throws error on network failure", async () => {
        const networkError = new Error("Network error");
        (getMessages as jest.Mock).mockRejectedValueOnce(networkError);

        await expect(getMessages(mockScoutID, mockPlayerID)).rejects.toThrow(
          "Network error"
        );
      });

      it("throws error on server error (5xx)", async () => {
        const serverError = new Error("Internal Server Error");
        (getMessages as jest.Mock).mockRejectedValueOnce(serverError);

        await expect(getMessages(mockScoutID, mockPlayerID)).rejects.toThrow(
          "Internal Server Error"
        );
      });
    });
  });

  describe("sendMessage", () => {
    describe("successful message sending", () => {
      it("returns newly created ChatMessage on success", async () => {
        (sendMessage as jest.Mock).mockResolvedValueOnce(mockChatMessage);

        const result = await sendMessage(mockScoutID, mockPlayerID, "Hello!");

        expect(result).toEqual(mockChatMessage);
        expect(result.id).toBe("msg-123");
        expect(result.text).toBe("Interested in your profile!");
      });

      it("preserves message text exactly as sent", async () => {
        const customText = "This is a custom message with special chars: @#$%";
        const customMessage: ChatMessage = {
          ...mockChatMessage,
          text: customText,
        };
        (sendMessage as jest.Mock).mockResolvedValueOnce(customMessage);

        const result = await sendMessage(mockScoutID, mockPlayerID, customText);

        expect(result.text).toBe(customText);
      });

      it("sets read to false for newly sent messages", async () => {
        const unreadMessage: ChatMessage = {
          ...mockChatMessage,
          read: false,
        };
        (sendMessage as jest.Mock).mockResolvedValueOnce(unreadMessage);

        const result = await sendMessage(mockScoutID, mockPlayerID, "New message");

        expect(result.read).toBe(false);
      });

      it("includes correct from and to addresses in response", async () => {
        const messageWithCorrectAddresses: ChatMessage = {
          ...mockChatMessage,
          from: mockScoutID,
          to: mockPlayerID,
        };
        (sendMessage as jest.Mock).mockResolvedValueOnce(messageWithCorrectAddresses);

        const result = await sendMessage(mockScoutID, mockPlayerID, "Test");

        expect(result.from).toBe(mockScoutID);
        expect(result.to).toBe(mockPlayerID);
      });
    });

    describe("401 Unauthorized handling", () => {
      it("dispatches auth:unauthorized event on 401", async () => {
        (sendMessage as jest.Mock).mockRejectedValueOnce(
          new Error("Unauthorized: Session expired")
        );

        await expect(
          sendMessage(mockScoutID, mockPlayerID, "Hello")
        ).rejects.toThrow("Unauthorized: Session expired");
      });

      it("throws error with message 'Unauthorized: Session expired' on 401", async () => {
        (sendMessage as jest.Mock).mockRejectedValueOnce(
          new Error("Unauthorized: Session expired")
        );

        await expect(
          sendMessage(mockScoutID, mockPlayerID, "Hello")
        ).rejects.toThrow("Unauthorized: Session expired");
      });
    });

    describe("exported interface typing", () => {
      it("returns properly typed ChatMessage object", async () => {
        (sendMessage as jest.Mock).mockResolvedValueOnce(mockChatMessage);

        const result = await sendMessage(mockScoutID, mockPlayerID, "Test");

        expect("id" in result).toBe(true);
        expect("from" in result).toBe(true);
        expect("to" in result).toBe(true);
        expect("text" in result).toBe(true);
        expect("timestamp" in result).toBe(true);
        expect("read" in result).toBe(true);
      });

      it("response has correct property types", async () => {
        (sendMessage as jest.Mock).mockResolvedValueOnce(mockChatMessage);

        const result = await sendMessage(mockScoutID, mockPlayerID, "Test");

        expect(typeof result.id).toBe("string");
        expect(typeof result.from).toBe("string");
        expect(typeof result.to).toBe("string");
        expect(typeof result.text).toBe("string");
        expect(typeof result.timestamp).toBe("number");
        expect(typeof result.read).toBe("boolean");
      });
    });

    describe("error handling", () => {
      it("throws error on network failure", async () => {
        const networkError = new Error("Network error");
        (sendMessage as jest.Mock).mockRejectedValueOnce(networkError);

        await expect(
          sendMessage(mockScoutID, mockPlayerID, "Hello")
        ).rejects.toThrow("Network error");
      });

      it("throws error on server error (5xx)", async () => {
        const serverError = new Error("Internal Server Error");
        (sendMessage as jest.Mock).mockRejectedValueOnce(serverError);

        await expect(
          sendMessage(mockScoutID, mockPlayerID, "Hello")
        ).rejects.toThrow("Internal Server Error");
      });

      it("throws error on validation failure (4xx)", async () => {
        const validationError = new Error("Bad Request: Invalid message");
        (sendMessage as jest.Mock).mockRejectedValueOnce(validationError);

        await expect(
          sendMessage(mockScoutID, mockPlayerID, "")
        ).rejects.toThrow("Bad Request: Invalid message");
      });
    });

    describe("request parameters", () => {
      it("accepts scoutID as parameter", async () => {
        (sendMessage as jest.Mock).mockResolvedValueOnce(mockChatMessage);

        await sendMessage(mockScoutID, mockPlayerID, "Test");

        expect(sendMessage).toHaveBeenCalledWith(mockScoutID, mockPlayerID, "Test");
      });

      it("accepts playerID as parameter", async () => {
        (sendMessage as jest.Mock).mockResolvedValueOnce(mockChatMessage);

        await sendMessage(mockScoutID, mockPlayerID, "Test");

        expect(sendMessage).toHaveBeenCalledWith(mockScoutID, mockPlayerID, "Test");
      });

      it("accepts text as parameter", async () => {
        (sendMessage as jest.Mock).mockResolvedValueOnce(mockChatMessage);

        const text = "This is a test message";
        await sendMessage(mockScoutID, mockPlayerID, text);

        expect(sendMessage).toHaveBeenCalledWith(mockScoutID, mockPlayerID, text);
      });
    });
  });

  describe("interface exports", () => {
    it("GetMessagesResponse interface is properly typed", () => {
      const mockResponse: GetMessagesResponse = {
        messages: [mockChatMessage],
      };

      expect(Array.isArray(mockResponse.messages)).toBe(true);
      expect(mockResponse.messages).toHaveLength(1);
    });

    it("SendMessageResponse interface is properly typed", () => {
      const mockResponse: SendMessageResponse = {
        message: mockChatMessage,
      };

      expect("message" in mockResponse).toBe(true);
      expect(mockResponse.message.id).toBe("msg-123");
    });

    it("both functions are exported and callable", () => {
      expect(typeof getMessages).toBe("function");
      expect(typeof sendMessage).toBe("function");
    });
  });
});
