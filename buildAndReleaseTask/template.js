let template = {
  "NuGet.Config": `<?xml version="1.0" encoding="utf-8"?>
  <configuration>
    <activePackageSource>
      <add key="nuget.org" value="https://www.nuget.org/api/v2/" />
    </activePackageSource>
    <packageSources>
      <add key="vsts-nuget-custom-feed" value="$FEED_URL" />
    </packageSources>
    <packageSourceCredentials>
      <vsts-nuget-custom-feed>
          <add key="Username" value="anyname" />
          <add key="ClearTextPassword" value="$FEED_API_KEY" />
      </vsts-nuget-custom-feed>
  </packageSourceCredentials>
  </configuration>`
};

module.exports = template;