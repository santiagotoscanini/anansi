"use client";

import { useState, type FormEvent } from "react";
import { X, UserPlus } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import toast from "react-hot-toast";

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RegisterModal({ isOpen, onClose }: RegisterModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isRegistering, setIsRegistering] = useState(false);

  const { register } = useGoals();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsRegistering(true);

    try {
      const success = await register(formData.name.trim(), formData.email.trim().toLowerCase(), formData.password);

      if (success) {
        toast.success(`Welcome ${formData.name}! Your account has been created.`);
        onClose();
        // Reset form
        setFormData({ name: "", email: "", password: "", confirmPassword: "" });
        setErrors({});
      } else {
        toast.error("Registration failed. Email may already exist.");
      }
    } catch (error) {
      toast.error("Registration failed. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg border border-white/20 bg-black p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserPlus className="h-5 w-5" />
            <h2 className="text-xl font-light text-white">Create Account</h2>
          </div>
          <button onClick={onClose} className="text-white/60 transition-colors hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-2 block text-sm font-light text-white/70">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="Enter your full name"
              className={`w-full rounded-lg border bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none transition-all ${
                errors.name ? "border-red-500 focus:border-red-400" : "border-white/20 focus:border-white/40"
              }`}
              required
            />
            {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="mb-2 block text-sm font-light text-white/70">Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="Enter your email"
              className={`w-full rounded-lg border bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none transition-all ${
                errors.email ? "border-red-500 focus:border-red-400" : "border-white/20 focus:border-white/40"
              }`}
              required
            />
            {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="mb-2 block text-sm font-light text-white/70">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleInputChange("password", e.target.value)}
              placeholder="Enter password (min. 6 characters)"
              className={`w-full rounded-lg border bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none transition-all ${
                errors.password ? "border-red-500 focus:border-red-400" : "border-white/20 focus:border-white/40"
              }`}
              required
            />
            {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-2 block text-sm font-light text-white/70">Confirm Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
              placeholder="Confirm your password"
              className={`w-full rounded-lg border bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none transition-all ${
                errors.confirmPassword ? "border-red-500 focus:border-red-400" : "border-white/20 focus:border-white/40"
              }`}
              required
            />
            {errors.confirmPassword && <p className="mt-1 text-sm text-red-400">{errors.confirmPassword}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isRegistering}
            className="mt-6 w-full rounded-lg border border-white/20 bg-white/10 py-3 font-light transition-all hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRegistering ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-white/60">
            Already have an account?{" "}
            <button onClick={onClose} className="text-white underline hover:text-white/80">
              Sign in instead
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
