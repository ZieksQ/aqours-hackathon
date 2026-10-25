using System.Diagnostics;
using System.Text.Json;
using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Accounts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class RealtimeReportingIntegrationTests(ApiFixture fixture)
{
    [Fact]
    public async Task SignalR_auth_subscription_notifications_and_rest_recovery_work_with_official_client()
    {
        var staffEmail = await CreateAccountAsync(AccountRoles.Staff, "realtime-staff");
        var customerEmail = await CreateAccountAsync(AccountRoles.Customer, "realtime-customer");
        var strangerEmail = await CreateAccountAsync(AccountRoles.Customer, "realtime-stranger");
        using var factory = fixture.Factory.WithWebHostBuilder(_ => { });
        factory.UseKestrel(0);
        factory.StartServer();
        var server = factory.Services.GetRequiredService<IServer>();
        var address = server.Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        var repository = FindRepositoryRoot();
        var script = Path.Combine(repository, "apps", "web", "scripts", "verify-reports-realtime.mjs");
        var inputPath = Path.Combine(Path.GetTempPath(), $"aqours-realtime-{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(inputPath, JsonSerializer.Serialize(new
        {
            baseUrl = address,
            staffEmail,
            customerEmail,
            strangerEmail,
            initialPassword = ApiFixture.AdminPassword,
            changedPassword = ApiFixture.ChangedPassword
        }));

        try
        {
            var start = new ProcessStartInfo("node")
            {
                WorkingDirectory = Path.Combine(repository, "apps", "web"),
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            start.ArgumentList.Add(script);
            start.ArgumentList.Add(inputPath);
            using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start the SignalR verification script.");
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90));
            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                process.Kill(entireProcessTree: true);
                throw;
            }
            Assert.True(process.ExitCode == 0, $"SignalR client verification failed.\n{await output}\n{await error}");
        }
        finally
        {
            if (File.Exists(inputPath)) File.Delete(inputPath);
        }
    }

    private async Task<string> CreateAccountAsync(string role, string prefix)
    {
        var email = $"{prefix}-{Guid.NewGuid():N}@aqours.test";
        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>()
            .CreateAsync(new(email, "Realtime", "Integration", "Tester", ApiFixture.AdminPassword, role));
        Assert.True(result.Succeeded, string.Join("; ", result.Errors?.SelectMany(errors => errors.Value) ?? []));
        return email;
    }

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Aqours.slnx"))) return directory.FullName;
        throw new DirectoryNotFoundException("Could not locate Aqours.slnx.");
    }
}
