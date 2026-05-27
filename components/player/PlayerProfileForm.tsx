"use client";

import { useState, FormEvent } from "react";
import { useWallet } from "@/hooks/useWallet";
import { buildRegisterPlayer } from "@/lib/contract";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import VideoUpload from "@/components/ui/VideoUpload";
import type { PlayerVitals } from "@/types";

interface PlayerProfileFormProps {
  onSuccess: (playerId: string) => void;
}

const POSITIONS = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
  "Winger",
  "Striker",
];

const REGIONS = [
  "Europe",
  "South America",
  "North America",
  "Africa",
  "Asia",
  "Oceania",
];

export default function PlayerProfileForm({ onSuccess }: PlayerProfileFormProps) {
  const { publicKey, signAndSubmit } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: "",
    age: "",
    position: "",
    region: "",
    nationality: "",
    bio: "",
    ipfsHash: "",
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.age) {
      newErrors.age = "Age is required";
    } else {
      const ageNum = parseInt(formData.age);
      if (isNaN(ageNum) || ageNum < 14 || ageNum > 45) {
        newErrors.age = "Age must be between 14 and 45";
      }
    }

    if (!formData.position) {
      newErrors.position = "Position is required";
    }

    if (!formData.region) {
      newErrors.region = "Region is required";
    }

    if (!formData.nationality.trim()) {
      newErrors.nationality = "Nationality is required";
    }

    if (!formData.ipfsHash) {
      newErrors.ipfsHash = "Highlight reel is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;
    if (!publicKey) {
      setErrors({ form: "Wallet not connected" });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const vitals: PlayerVitals = {
        name: formData.name,
        age: parseInt(formData.age),
        position: formData.position,
        region: formData.region,
        nationality: formData.nationality,
      };

      const xdr = await buildRegisterPlayer(publicKey, vitals, formData.ipfsHash);
      const result = await signAndSubmit(xdr);

      // Extract player ID from result or generate it
      // For now, we'll use the transaction hash as a temporary ID
      // In a real implementation, this would come from the contract response
      const playerId = (result as any)?.id || publicKey;

      onSuccess(playerId);
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : "Registration failed",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev: typeof formData) => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev: Record<string, string>) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className={`input ${errors.name ? "border-red-500" : ""}`}
          placeholder="Enter your full name"
        />
        {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Age *
        </label>
        <input
          type="number"
          name="age"
          value={formData.age}
          onChange={handleChange}
          className={`input ${errors.age ? "border-red-500" : ""}`}
          placeholder="Enter your age (14-45)"
          min="14"
          max="45"
        />
        {errors.age && <p className="text-sm text-red-500 mt-1">{errors.age}</p>}
      </div>

      <Select
        label="Position *"
        name="position"
        value={formData.position}
        onChange={handleChange}
        error={errors.position}
      >
        <option value="">Select position</option>
        {POSITIONS.map((pos) => (
          <option key={pos} value={pos}>
            {pos}
          </option>
        ))}
      </Select>

      <Select
        label="Region *"
        name="region"
        value={formData.region}
        onChange={handleChange}
        error={errors.region}
      >
        <option value="">Select region</option>
        {REGIONS.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </Select>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Nationality *
        </label>
        <input
          type="text"
          name="nationality"
          value={formData.nationality}
          onChange={handleChange}
          className={`input ${errors.nationality ? "border-red-500" : ""}`}
          placeholder="Enter your nationality"
        />
        {errors.nationality && (
          <p className="text-sm text-red-500 mt-1">{errors.nationality}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Bio
        </label>
        <textarea
          name="bio"
          value={formData.bio}
          onChange={handleChange}
          className="input resize-none"
          rows={3}
          placeholder="Tell us about yourself (optional)"
        />
      </div>

      <VideoUpload
        onUpload={(cid) => setFormData((prev: typeof formData) => ({ ...prev, ipfsHash: cid }))}
        error={errors.ipfsHash}
      />

      {errors.form && (
        <p className="text-sm text-red-500 text-center">{errors.form}</p>
      )}

      <Button type="submit" isLoading={isLoading} disabled={isLoading} className="w-full">
        {isLoading ? "Registering..." : "Register as Player"}
      </Button>
    </form>
  );
}
