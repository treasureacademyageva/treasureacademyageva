import { authenticateDeveloper, jsonResponse } from './admission-tracking.mjs';

function safeAuthenticatedReadOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function enabled(name) {
  return process.env[name] === 'true';
}

function countBy(rows, key) {
  return (rows || []).reduce((result, row) => {
    const value = String(row[key] || 'unknown');
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function errorResponse(error) {
  const status = Number(error?.status || 0);
  if (status === 404 || String(error?.message) === 'disabled') return jsonResponse(404, { error: 'Not found' });
  if (status === 401) return jsonResponse(401, { error: 'Sign in again to continue.' });
  if (status === 403) return jsonResponse(403, { error: 'This account does not have developer console access.' });
  return jsonResponse(503, { error: 'Developer console data is temporarily unavailable.' });
}

export async function handleDeveloperConsole(request) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });
  if (!safeAuthenticatedReadOrigin(request)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  try {
    const auth = await authenticateDeveloper(request, 'console');
    const now = new Date().toISOString();
    const capabilityResult = await auth.adminClient.from('developer_capabilities')
      .select('console_access,otp_dispatch,information_review,system_health_read,granted_at')
      .eq('profile_id', auth.user.id).is('revoked_at', null).single();
    if (capabilityResult.error || !capabilityResult.data?.console_access) throw new Error('capability_query');
    const capabilities = capabilityResult.data;

    // Query and return sensitive operational categories only when the matching
    // capability is present. Console access is the shell permission, not a
    // shortcut around OTP, information-review or system-health boundaries.
    const noRows = () => Promise.resolve({ data: [], error: null });
    const [challengeResult, claimChallengeResult, admissionResult, requestResult, publicationResult] = await Promise.all([
      capabilities.otp_dispatch
        ? auth.adminClient.from('admission_tracking_challenges').select('status,expires_at').gt('expires_at', now)
        : noRows(),
      capabilities.otp_dispatch && enabled('PORTAL_ACCOUNT_CLAIM_ENABLED')
        ? auth.adminClient.from('portal_account_claim_challenges').select('status,expires_at').gt('expires_at', now)
        : noRows(),
      auth.adminClient.from('admission_applications').select('status,student_id,submission_source'),
      capabilities.information_review
        ? auth.adminClient.from('website_requests').select('request_type,status').eq('request_type', 'information_update')
        : noRows(),
      capabilities.information_review
        ? auth.adminClient.from('verified_public_information').select('topic,status,effective_until,published_at')
        : noRows()
    ]);
    const failed = [challengeResult, claimChallengeResult, admissionResult, requestResult, publicationResult].find((result) => result.error);
    if (failed) throw new Error('query');

    const challenges = [...(challengeResult.data || []), ...(claimChallengeResult.data || [])];
    const admissions = admissionResult.data || [];
    const publications = publicationResult.data || [];
    const converted = admissions.filter((row) => row.student_id).length;
    const infoRequests = requestResult.data || [];
    const information = capabilities.information_review ? {
      updateRequests: infoRequests.length,
      openUpdateRequests: infoRequests.filter((row) => !['confirmed', 'declined', 'closed'].includes(row.status)).length,
      publicationTopics: publications.length,
      byStatus: countBy(publications, 'status'),
      stalePublications: publications.filter((row) => row.effective_until && new Date(row.effective_until).getTime() < Date.now()).length
    } : null;
    const gates = capabilities.system_health_read ? {
      portal: enabled('PORTAL_ENABLED'),
      accounts: enabled('PORTAL_ACCOUNTS_ENABLED'),
      registration: enabled('PORTAL_REGISTRATION_ENABLED'),
      accountClaim: enabled('PORTAL_ACCOUNT_CLAIM_ENABLED'),
      office: enabled('PORTAL_OFFICE_ENABLED'),
      paragonOtpRelay: enabled('PARAGON_OTP_RELAY_ENABLED'),
      admissionTracking: enabled('ADMISSION_TRACKING_ENABLED'),
      developerConsole: enabled('DEVELOPER_CONSOLE_ENABLED'),
      developerManualBootstrap: enabled('DEVELOPER_MANUAL_BOOTSTRAP_ENABLED'),
      publicInformation: enabled('PUBLIC_INFORMATION_ENABLED'),
      websiteRequests: enabled('WEBSITE_REQUESTS_ENABLED'),
      monnifyWebhook: enabled('MONNIFY_WEBHOOK_ENABLED') && enabled('MONNIFY_OWNER_VERIFIED')
    } : null;

    return jsonResponse(200, {
      profile: { fullName: auth.profile.full_name || 'Authorised developer' },
      capabilities,
      operations: {
        otpQueue: capabilities.otp_dispatch
          ? challenges.filter((row) => ['queued', 'revealed', 'sent'].includes(row.status)).length
          : null,
        otpByStatus: capabilities.otp_dispatch ? countBy(challenges, 'status') : null,
        sessionValidation: 'current'
      },
      admissions: {
        totalApplications: admissions.length,
        unlinkedApplications: admissions.length - converted,
        convertedApplications: converted,
        byStatus: countBy(admissions, 'status'),
        bySource: countBy(admissions, 'submission_source')
      },
      information,
      gates,
      generatedAt: now
    });
  } catch (error) {
    return errorResponse(error);
  }
}
