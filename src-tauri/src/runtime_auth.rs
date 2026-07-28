pub(crate) fn classify_auth_state(
    worker_profile_exists: bool,
    success: bool,
    stdout: &str,
    stderr: &str,
) -> &'static str {
    if !worker_profile_exists {
        return "unknown";
    }
    if success {
        return "ready";
    }
    let evidence = format!("{stdout}\n{stderr}").to_lowercase();
    let login_signals = [
        "not logged in",
        "login required",
        "not authenticated",
        "authentication required",
    ];
    if login_signals.iter().any(|signal| evidence.contains(signal)) {
        "login_required"
    } else {
        "config_invalid"
    }
}

pub(crate) fn numeric_version(value: &str) -> Option<[u64; 3]> {
    let start = value.find(|character: char| character.is_ascii_digit())?;
    let version = value[start..]
        .split_whitespace()
        .next()?
        .trim_matches(|character: char| !character.is_ascii_digit() && character != '.');
    let mut parts = version.split('.').map(|part| part.parse::<u64>().ok());
    Some([parts.next()??, parts.next()??, parts.next()??])
}

pub(crate) fn version_supported(version: &str, minimum: [u64; 3], maximum: [u64; 3]) -> bool {
    numeric_version(version).is_some_and(|parsed| parsed >= minimum && parsed < maximum)
}

#[cfg(test)]
mod tests {
    use super::classify_auth_state;

    #[test]
    fn missing_invalid_and_logged_out_profiles_are_distinct() {
        assert_eq!(classify_auth_state(false, false, "", ""), "unknown");
        assert_eq!(
            classify_auth_state(true, false, "", "configuration parse error"),
            "config_invalid"
        );
        assert_eq!(
            classify_auth_state(true, false, "", "Not logged in"),
            "login_required"
        );
        assert_eq!(classify_auth_state(true, true, "", ""), "ready");
    }
}
