import { CloudFrontRequestEvent } from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import { createLambdaHandler } from '@hollowverse/utils/helpers/createLambdaHandler';
import cookie from 'cookie';
import weighted from 'weighted';
import isBot from 'is-bot';
import qs from 'querystring';

type CreateAssignEnvironmentToViewerRequestOptions = {
  publicBranches: Record<string, number>;
};

export const createAssignEnvironmentToViewerRequest = ({
  publicBranches,
}: CreateAssignEnvironmentToViewerRequestOptions) => async (
  event: CloudFrontRequestEvent,
) => {
  const request = event.Records[0].cf.request;

  const params = qs.parse<Record<string, string | undefined>>(
    request.querystring,
  );

  const cookies = (request.headers.cookie || [])
    .map(header => cookie.parse(header.value))
    .reduce((acc, cookiesInHeader) => ({ ...acc, ...cookiesInHeader }), {});

  const branch = params.branch || cookies.branch;

  if (branch) {
    request.headers['x-hollowverse-requested-branch'] = [
      {
        key: 'x-hollowverse-requested-branch',
        value: branch,
      },
    ];

    return request;
  }

  let env: string | undefined = cookies.env;

  if (env) {
    request.headers['x-hollowverse-requested-environment'] = [
      {
        key: 'x-hollowverse-requested-environment',
        value: env,
      },
    ];
  }

  if (!env || !(env in publicBranches)) {
    const userAgent =
      request.headers['user-agent'] &&
      request.headers['user-agent'][0] &&
      request.headers['user-agent'][0].value;

    if (isBot(userAgent) || /webpagetest/i.test(userAgent)) {
      env = 'master';
    } else {
      env = weighted.select<string>(publicBranches);
    }
  }

  request.headers['x-hollowverse-assigned-environment'] = [
    {
      key: 'x-hollowverse-assigned-environment',
      value: env,
    },
  ];

  return request;
};

export const assignEnvironmentToViewerRequest = createLambdaHandler(
  createAssignEnvironmentToViewerRequest({
    publicBranches: {
      master: 0.75,
      beta: 0.25,
    },
  }),
);