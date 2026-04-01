import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";

export function Breadcrumb({ items }) {
  return (
    <nav className="flex items-center space-x-2 text-sm mb-6">
      <Link
        to="/"
        className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2">
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-600" />
          {item.href ? (
            <Link
              to={item.href}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}