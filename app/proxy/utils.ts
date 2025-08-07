// Shared utilities for App Proxy handlers

export const addCorsHeaders = (responseInit: ResponseInit = {}) => {
  return {
    ...responseInit,
    headers: {
      ...(responseInit.headers || {}),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  };
};

// Function to validate customer fields before sending to API
export function validateCustomerFields(customer: any): string[] {
  const errors: string[] = [];

  // Validate phone number if provided
  if (customer.phone) {
    // Remove all non-digit characters for validation
    const digitsOnly = customer.phone.replace(/\D/g, "");

    if (digitsOnly.length < 10) {
      errors.push("Phone number must have at least 10 digits");
    } else if (digitsOnly.length > 15) {
      errors.push("Phone number has too many digits");
    }

    // Check if phone contains any valid digits
    if (!/\d/.test(customer.phone)) {
      errors.push("Phone number must contain numeric digits");
    }
  }

  // Validate email if provided
  if (customer.email) {
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errors.push(
        "Email address format is invalid. Please provide a valid email (example: name@example.com)",
      );
    }
  }

  // Validate default address if provided
  if (customer.defaultAddress) {
    const address = customer.defaultAddress;

    // Check if the address is an object with the required properties
    if (typeof address !== "object") {
      errors.push(
        "Address must be provided as a complete object with all required fields",
      );
      return errors;
    }

    // Check required address fields
    if (!address.address1 || !String(address.address1).trim()) {
      errors.push("Street address is required");
    }

    if (!address.city || !String(address.city).trim()) {
      errors.push("City is required for the address");
    }

    if (!address.zip || !String(address.zip).trim()) {
      errors.push("ZIP/Postal code is required for the address");
    }

    if (!address.country && !address.countryCode) {
      errors.push("Country is required for the address");
    }

    // Not all jurisdictions require provinces/states, so this is less strict
    if (
      address.country === "United States" ||
      address.country === "US" ||
      address.countryCode === "US" ||
      address.country === "Canada" ||
      address.country === "CA" ||
      address.countryCode === "CA"
    ) {
      if (!address.province && !address.provinceCode) {
        errors.push(
          "State/Province is required for addresses in the US and Canada",
        );
      }
    }
  }

  return errors;
}

// Function to convert API error messages to user-friendly messages
export function getFriendlyErrorMessage(
  field: string,
  message: string,
): string {
  // Map of common error messages to more user-friendly versions
  const errorMap: Record<string, string> = {
    // Phone errors
    "phone is invalid":
      "The phone number format is invalid. Please use a standard format like (123) 456-7890 or +1 234 567 8901.",

    // Email errors
    "email is invalid":
      "The email address format is invalid. Please provide a valid email (example: name@example.com).",
    "email has already been taken":
      "This email address is already in use by another account.",

    // Address errors
    "address1 can't be blank": "Street address cannot be empty.",
    "city can't be blank": "City cannot be empty.",
    "province can't be blank": "State/Province cannot be empty.",
    "zip can't be blank": "ZIP/Postal code cannot be empty.",
    "country can't be blank": "Country cannot be empty.",
    "defaultAddress.address1 can't be blank": "Street address cannot be empty.",
    "defaultAddress.city can't be blank": "City cannot be empty.",
    "defaultAddress.province can't be blank": "State/Province cannot be empty.",
    "defaultAddress.zip can't be blank": "ZIP/Postal code cannot be empty.",
    "defaultAddress.country can't be blank": "Country cannot be empty.",

    // Name errors
    "first_name can't be blank": "First name cannot be empty.",
    "last_name can't be blank": "Last name cannot be empty.",
  };

  // Build the lookup key from field and message
  const lookupKey = message.toLowerCase();

  // Check if we have a friendly message for this error
  if (errorMap[lookupKey]) {
    return errorMap[lookupKey];
  }

  // Handle address field errors more cleanly
  if (field && field.startsWith("defaultAddress.")) {
    const addressPart = field.replace("defaultAddress.", "");
    const readableField = addressPart
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    return `Address ${readableField}: ${message}`;
  }

  // If the field is specified, create a field-specific message
  if (field) {
    const readableField = field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    return `${readableField}: ${message}`;
  }

  // Default fallback
  return message;
}
