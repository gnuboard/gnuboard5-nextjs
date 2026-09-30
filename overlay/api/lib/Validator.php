<?php
/**
 * Gnuboard5 REST API - Input Validation Helper
 *
 * Provides a lightweight, declarative validation layer for request data.
 *
 * Usage:
 *   $v = new Validator();
 *   $errors = $v->validate([
 *       'mb_id'    => 'required|min:3|max:20',
 *       'mb_email' => 'required|email',
 *       'mb_level' => 'integer',
 *   ], $data);
 *
 *   if ($errors) {
 *       Response::error('Validation failed', 422, $errors);
 *   }
 */

class Validator
{
    // ------------------------------------------------------------------
    // Individual rule checks (static, reusable)
    // ------------------------------------------------------------------

    /**
     * Check that all $fields exist and are non-empty in $data.
     *
     * @param  array $fields  List of field names
     * @param  array $data    Associative input data
     * @return array          Associative array of field => error message
     */
    public static function required(array $fields, array $data)
    {
        $errors = [];
        foreach ($fields as $field) {
            if (!isset($data[$field]) || (is_string($data[$field]) && trim($data[$field]) === '')) {
                $errors[$field] = "{$field} is required.";
            }
        }
        return $errors;
    }

    /**
     * Validate an email address.
     *
     * @param  mixed $value
     * @return bool
     */
    public static function email($value)
    {
        return (bool) filter_var($value, FILTER_VALIDATE_EMAIL);
    }

    /**
     * Check minimum string length.
     *
     * @param  mixed $value
     * @param  int   $min
     * @return bool
     */
    public static function minLength($value, $min)
    {
        return mb_strlen((string) $value) >= (int) $min;
    }

    /**
     * Check maximum string length.
     *
     * @param  mixed $value
     * @param  int   $max
     * @return bool
     */
    public static function maxLength($value, $max)
    {
        return mb_strlen((string) $value) <= (int) $max;
    }

    /**
     * Check that a value is a valid integer (or integer-like string).
     *
     * @param  mixed $value
     * @return bool
     */
    public static function integer($value)
    {
        return filter_var($value, FILTER_VALIDATE_INT) !== false;
    }

    // ------------------------------------------------------------------
    // Declarative validation runner
    // ------------------------------------------------------------------

    /**
     * Run a set of validation rules against the provided data.
     *
     * Rules string format: "required|email|min:3|max:255|integer"
     * Each field maps to a pipe-delimited list of rules.
     *
     * @param  array $rules  ['field_name' => 'rule1|rule2:param', ...]
     * @param  array $data   Associative input data
     * @return array          Associative array of field => error messages (empty if valid)
     */
    public static function validate(array $rules, array $data)
    {
        $errors = [];

        foreach ($rules as $field => $ruleString) {
            $ruleParts = explode('|', $ruleString);

            foreach ($ruleParts as $rule) {
                // Parse rule:param
                $param = null;
                if (strpos($rule, ':') !== false) {
                    list($rule, $param) = explode(':', $rule, 2);
                }

                $value = isset($data[$field]) ? $data[$field] : null;

                switch ($rule) {
                    case 'required':
                        if ($value === null || (is_string($value) && trim($value) === '')) {
                            $errors[$field][] = "{$field} is required.";
                        }
                        break;

                    case 'email':
                        if ($value !== null && $value !== '' && !self::email($value)) {
                            $errors[$field][] = "{$field} must be a valid email address.";
                        }
                        break;

                    case 'min':
                        if ($value !== null && $value !== '' && !self::minLength($value, $param)) {
                            $errors[$field][] = "{$field} must be at least {$param} characters.";
                        }
                        break;

                    case 'max':
                        if ($value !== null && $value !== '' && !self::maxLength($value, $param)) {
                            $errors[$field][] = "{$field} must not exceed {$param} characters.";
                        }
                        break;

                    case 'integer':
                        if ($value !== null && $value !== '' && !self::integer($value)) {
                            $errors[$field][] = "{$field} must be an integer.";
                        }
                        break;

                    case 'numeric':
                        if ($value !== null && $value !== '' && !is_numeric($value)) {
                            $errors[$field][] = "{$field} must be numeric.";
                        }
                        break;

                    case 'in':
                        $allowed = explode(',', $param);
                        if ($value !== null && $value !== '' && !in_array($value, $allowed, true)) {
                            $errors[$field][] = "{$field} must be one of: {$param}.";
                        }
                        break;

                    default:
                        // Unknown rule – silently skip
                        break;
                }
            }

            // Flatten single-element arrays for cleaner output
            if (isset($errors[$field]) && count($errors[$field]) === 1) {
                $errors[$field] = $errors[$field][0];
            }
        }

        return $errors;
    }
}
