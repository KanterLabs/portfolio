#!/usr/bin/env bash
set -Eeuo pipefail

MODE=${1:-}
TOKEN_OUTPUT=${2:-}

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

CF_API=https://api.cloudflare.com/client/v4
ACCOUNT_ID=090ae73dce25f4eca9a53ee396fdc916
ZONE_ID=1206ce4daa0fe3c4791f9df9069764f6
BETA_HOST=beta.shanekanterman.dev
STASHLET_OWNER_HOST=stash-admin.shanekanterman.dev
STASHLET_OWNER_POLICY="Stashlet owner only"
ACCESS_APP_NAME="Portfolio beta"
ACCESS_POLICY_NAME="Portfolio beta owner only"
TUNNEL_NAME=portfolio-beta-homelab

cf_request() {
    local method=$1
    local path=$2
    local body=${3:-}
    local response

    if [[ -n "$body" ]]; then
        response=$(curl --fail --silent --show-error \
            --request "$method" \
            --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
            --header "Content-Type: application/json" \
            --data "$body" \
            "$CF_API$path")
    else
        response=$(curl --fail --silent --show-error \
            --request "$method" \
            --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
            "$CF_API$path")
    fi

    if [[ "$(jq -r '.success' <<<"$response")" != "true" ]]; then
        jq -r '.errors[]? | "Cloudflare error \(.code): \(.message)"' <<<"$response" >&2
        return 1
    fi
    printf '%s' "$response"
}

find_tunnel_id() {
    cf_request GET "/accounts/$ACCOUNT_ID/cfd_tunnel?is_deleted=false&per_page=100" \
        | jq -r --arg name "$TUNNEL_NAME" '.result[] | select(.name == $name) | .id' \
        | head -n 1
}

find_access_app_id() {
    cf_request GET "/accounts/$ACCOUNT_ID/access/apps?per_page=100" \
        | jq -r --arg domain "$BETA_HOST" --arg name "$ACCESS_APP_NAME" \
            '.result[] | select(.domain == $domain and .name == $name) | .id' \
        | head -n 1
}

find_owner_email() {
    local app_id
    app_id=$(cf_request GET "/accounts/$ACCOUNT_ID/access/apps?per_page=100" \
        | jq -r --arg domain "$STASHLET_OWNER_HOST" \
            '.result[] | select(.domain == $domain) | .id' \
        | head -n 1)
    [[ -n "$app_id" ]] || {
        printf 'Stashlet owner Access application is missing\n' >&2
        return 1
    }

    cf_request GET "/accounts/$ACCOUNT_ID/access/apps/$app_id/policies" \
        | jq -er --arg name "$STASHLET_OWNER_POLICY" '
            [
                .result[]
                | select(.name == $name)
                | .include[]?
                | .email.email?
                | select(type == "string" and length > 0)
            ]
            | unique
            | if length == 1 then .[0] else error("expected exactly one Stashlet owner email") end
        '
}

prepare() {
    if [[ -z "$TOKEN_OUTPUT" ]]; then
        printf 'prepare requires a tunnel-token output path\n' >&2
        exit 64
    fi

    local owner_email idp_id auth_domain team_name
    local app_response app_id app_aud app_body policy_id policy_body tunnel_id

    owner_email=$(find_owner_email)
    idp_id=$(cf_request GET "/accounts/$ACCOUNT_ID/access/identity_providers" \
        | jq -r '.result[] | select(.type == "onetimepin") | .id' \
        | head -n 1)
    [[ -n "$idp_id" ]] || {
        printf 'Cloudflare one-time PIN identity provider is missing\n' >&2
        exit 1
    }

    auth_domain=$(cf_request GET "/accounts/$ACCOUNT_ID/access/organizations" \
        | jq -r '.result.auth_domain')
    team_name=${auth_domain%%.*}

    app_body=$(jq -cn \
        --arg name "$ACCESS_APP_NAME" \
        --arg domain "$BETA_HOST" \
        --arg idp "$idp_id" \
        '{
            name:$name,
            domain:$domain,
            type:"self_hosted",
            session_duration:"168h",
            auto_redirect_to_identity:true,
            allowed_idps:[$idp],
            app_launcher_visible:false
        }')

    app_response=$(cf_request GET "/accounts/$ACCOUNT_ID/access/apps?per_page=100")
    app_id=$(jq -r --arg domain "$BETA_HOST" \
        '.result[] | select(.domain == $domain) | .id' <<<"$app_response" \
        | head -n 1)
    if [[ -z "$app_id" ]]; then
        app_response=$(cf_request POST "/accounts/$ACCOUNT_ID/access/apps" "$app_body")
    else
        app_response=$(cf_request PUT "/accounts/$ACCOUNT_ID/access/apps/$app_id" "$app_body")
    fi
    app_id=$(jq -r '.result.id' <<<"$app_response")
    app_aud=$(jq -r '.result.aud' <<<"$app_response")
    [[ -n "$app_id" && -n "$app_aud" && "$app_aud" != "null" ]] || {
        printf 'Cloudflare Access application metadata is incomplete\n' >&2
        exit 1
    }

    policy_id=$(cf_request GET "/accounts/$ACCOUNT_ID/access/apps/$app_id/policies" \
        | jq -r --arg name "$ACCESS_POLICY_NAME" \
            '.result[] | select(.name == $name) | .id' \
        | head -n 1)
    policy_body=$(jq -cn \
        --arg name "$ACCESS_POLICY_NAME" \
        --arg email "$owner_email" \
        '{name:$name,decision:"allow",precedence:1,include:[{email:{email:$email}}]}')
    if [[ -z "$policy_id" ]]; then
        cf_request POST "/accounts/$ACCOUNT_ID/access/apps/$app_id/policies" "$policy_body" >/dev/null
    else
        cf_request PUT "/accounts/$ACCOUNT_ID/access/apps/$app_id/policies/$policy_id" "$policy_body" >/dev/null
    fi

    tunnel_id=$(find_tunnel_id)
    if [[ -z "$tunnel_id" ]]; then
        tunnel_id=$(cf_request POST "/accounts/$ACCOUNT_ID/cfd_tunnel" \
            "$(jq -cn --arg name "$TUNNEL_NAME" '{name:$name,config_src:"cloudflare"}')" \
            | jq -r '.result.id')
    fi

    cf_request PUT "/accounts/$ACCOUNT_ID/cfd_tunnel/$tunnel_id/configurations" "$(
        jq -cn \
            --arg host "$BETA_HOST" \
            --arg team "$team_name" \
            --arg aud "$app_aud" \
            '{
                config:{
                    ingress:[
                        {
                            hostname:$host,
                            service:"http://127.0.0.1:80",
                            originRequest:{
                                httpHostHeader:$host,
                                access:{
                                    required:true,
                                    teamName:$team,
                                    audTag:[$aud]
                                }
                            }
                        },
                        {service:"http_status:404"}
                    ]
                }
            }'
    )" >/dev/null

    umask 077
    cf_request GET "/accounts/$ACCOUNT_ID/cfd_tunnel/$tunnel_id/token" \
        | jq -er '.result' >"$TOKEN_OUTPUT"
    chmod 0600 "$TOKEN_OUTPUT"
    printf 'cloudflare_prepare=ok\n'
}

publish() {
    local tunnel_id response record_id record_type body

    tunnel_id=$(find_tunnel_id)
    [[ -n "$tunnel_id" ]] || {
        printf 'portfolio beta tunnel does not exist\n' >&2
        exit 1
    }

    response=$(cf_request GET "/zones/$ZONE_ID/dns_records?name=$BETA_HOST")
    record_id=$(jq -r '.result[0].id // empty' <<<"$response")
    record_type=$(jq -r '.result[0].type // empty' <<<"$response")
    if [[ -n "$record_type" && "$record_type" != "CNAME" ]]; then
        printf 'DNS name %s already exists with type %s\n' "$BETA_HOST" "$record_type" >&2
        exit 1
    fi

    body=$(jq -cn \
        --arg name "$BETA_HOST" \
        --arg content "$tunnel_id.cfargotunnel.com" \
        '{type:"CNAME",name:$name,content:$content,proxied:true,ttl:1}')
    if [[ -z "$record_id" ]]; then
        cf_request POST "/zones/$ZONE_ID/dns_records" "$body" >/dev/null
    else
        cf_request PUT "/zones/$ZONE_ID/dns_records/$record_id" "$body" >/dev/null
    fi
    printf 'cloudflare_publish=ok\n'
}

validate() {
    local tunnel_id tunnel_status app_count app_id policy_count response dns_count status

    tunnel_id=$(find_tunnel_id)
    [[ -n "$tunnel_id" ]] || {
        printf 'portfolio beta tunnel does not exist\n' >&2
        exit 1
    }
    tunnel_status=$(cf_request GET "/accounts/$ACCOUNT_ID/cfd_tunnel/$tunnel_id" \
        | jq -r '.result.status')
    [[ "$tunnel_status" == "healthy" ]] || {
        printf 'expected healthy beta tunnel, got %s\n' "$tunnel_status" >&2
        exit 1
    }

    response=$(cf_request GET "/accounts/$ACCOUNT_ID/access/apps?per_page=100")
    app_count=$(jq -r --arg domain "$BETA_HOST" \
        '[.result[] | select(.domain == $domain)] | length' <<<"$response")
    [[ "$app_count" == "1" ]] || {
        printf 'expected exactly one beta Access application\n' >&2
        exit 1
    }
    app_id=$(jq -r --arg domain "$BETA_HOST" \
        '.result[] | select(.domain == $domain) | .id' <<<"$response")
    policy_count=$(cf_request GET "/accounts/$ACCOUNT_ID/access/apps/$app_id/policies" \
        | jq -r --arg name "$ACCESS_POLICY_NAME" \
            '[.result[] | select(.name == $name and .decision == "allow")] | length')
    [[ "$policy_count" == "1" ]] || {
        printf 'expected exactly one beta owner policy\n' >&2
        exit 1
    }

    response=$(cf_request GET "/zones/$ZONE_ID/dns_records?name=$BETA_HOST")
    dns_count=$(jq -r --arg target "$tunnel_id.cfargotunnel.com" '
        [
            .result[]
            | select(
                .type == "CNAME"
                and .content == $target
                and .proxied == true
            )
        ]
        | length
    ' <<<"$response")
    [[ "$dns_count" == "1" ]] || {
        printf 'beta DNS record is missing or incorrect\n' >&2
        exit 1
    }

    status=$(curl --silent --show-error --output /dev/null \
        --write-out '%{http_code}' "https://$BETA_HOST/healthz")
    [[ "$status" == "302" || "$status" == "303" ]] || {
        printf 'expected Cloudflare Access redirect, got HTTP %s\n' "$status" >&2
        exit 1
    }
    printf 'cloudflare_validation=ok\n'
}

retire_plan() {
    local tunnel_id app_id response dns_count app_count tunnel_count

    tunnel_id=$(find_tunnel_id)
    tunnel_count=0
    [[ -z "$tunnel_id" ]] || tunnel_count=1

    response=$(cf_request GET "/accounts/$ACCOUNT_ID/access/apps?per_page=100")
    app_count=$(jq -r --arg domain "$BETA_HOST" --arg name "$ACCESS_APP_NAME" '
        [.result[] | select(.domain == $domain and .name == $name)] | length
    ' <<<"$response")
    app_id=$(find_access_app_id)

    response=$(cf_request GET "/zones/$ZONE_ID/dns_records?name=$BETA_HOST")
    dns_count=$(jq -r --arg target "$tunnel_id.cfargotunnel.com" '
        [
            .result[]
            | select(
                .type == "CNAME"
                and .content == $target
                and .proxied == true
            )
        ]
        | length
    ' <<<"$response")

    [[ "$tunnel_count" == 1 ]] || {
        printf 'expected exactly one active named beta Tunnel\n' >&2
        return 1
    }
    [[ "$app_count" == 1 && -n "$app_id" ]] || {
        printf 'expected exactly one named beta Access application\n' >&2
        return 1
    }
    [[ "$dns_count" == 1 ]] || {
        printf 'expected exactly one beta DNS record targeting the named Tunnel\n' >&2
        return 1
    }
    printf 'beta_retire_plan=tunnel:1,access:1,dns:1\n'
}

audit_retired() {
    local tunnel_id response app_count dns_count

    tunnel_id=$(find_tunnel_id)
    response=$(cf_request GET "/accounts/$ACCOUNT_ID/access/apps?per_page=100")
    app_count=$(jq -r --arg domain "$BETA_HOST" '
        [.result[] | select(.domain == $domain)] | length
    ' <<<"$response")
    response=$(cf_request GET "/zones/$ZONE_ID/dns_records?name=$BETA_HOST")
    dns_count=$(jq -r '.result | length' <<<"$response")

    [[ -z "$tunnel_id" ]] || {
        printf 'beta Tunnel is still active\n' >&2
        return 1
    }
    [[ "$app_count" == 0 ]] || {
        printf 'beta Access application still exists\n' >&2
        return 1
    }
    [[ "$dns_count" == 0 ]] || {
        printf 'beta DNS record still exists\n' >&2
        return 1
    }
    printf 'beta_retired=tunnel:0,access:0,dns:0\n'
}

retire() {
    local tunnel_id app_id response record_id

    retire_plan >/dev/null
    tunnel_id=$(find_tunnel_id)
    app_id=$(find_access_app_id)
    response=$(cf_request GET "/zones/$ZONE_ID/dns_records?name=$BETA_HOST")
    record_id=$(jq -r '.result[0].id' <<<"$response")

    cf_request DELETE "/zones/$ZONE_ID/dns_records/$record_id" >/dev/null
    cf_request DELETE "/accounts/$ACCOUNT_ID/access/apps/$app_id" >/dev/null
    cf_request DELETE "/accounts/$ACCOUNT_ID/cfd_tunnel/$tunnel_id" >/dev/null
    audit_retired
}

case "$MODE" in
prepare) prepare ;;
publish) publish ;;
validate) validate ;;
retire-plan) retire_plan ;;
retire) retire ;;
audit-retired) audit_retired ;;
*)
    printf 'usage: %s prepare <token-output> | publish | validate | retire-plan | retire | audit-retired\n' "$0" >&2
    exit 64
    ;;
esac
