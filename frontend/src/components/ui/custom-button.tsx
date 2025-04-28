import React from 'react';
import { LucideIcon } from 'lucide-react';

interface CustomButtonProps {
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'green';
}

export const CustomButton: React.FC<CustomButtonProps> = ({ onClick, icon: Icon, label, disabled = false, variant = 'default' }) => {
  const baseClasses = "px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center justify-center space-x-2 w-full sm:w-auto";
  
  const variantClasses = {
    default: "bg-blue-600 hover:bg-blue-700 text-white",
    destructive: "bg-red-600 hover:bg-red-700 text-white",
    outline: "bg-white hover:bg-gray-100 text-gray-800 border border-gray-300",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
    ghost: "hover:bg-gray-100 text-gray-800",
    link: "text-blue-600 hover:underline",
    green: "bg-green-600 hover:bg-green-700 text-white"
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classes}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  );
};
