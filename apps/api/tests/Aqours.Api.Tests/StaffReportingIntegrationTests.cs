using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Aqours.Api.Features.Accounts;
using Aqours.Api.Features.Reports;
using Aqours.Application.Features.Accounts;
using Aqours.Application.Features.Reports;
using Aqours.Domain.Features.Accounts;
using Aqours.Domain.Features.Reports;
using Aqours.Infrastructure.Features.Reports;
using Aqours.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace Aqours.Api.Tests;

[Collection(AuthenticationCollection.Name)]
public sealed class StaffReportingIntegrationTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Queue_filters_and_detail_return_supplier_workflow_data()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var unassigned = await CreateReportAsync("queue-unassigned");
        var assigned = await CreateReportAsync("queue-assigned");
        using var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{assigned}/claim", new { }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        using var all = await staff.Client.GetAsync("/api/staff/reports?tab=all&page=1&pageSize=100");
        Assert.Equal(HttpStatusCode.OK, all.StatusCode);
        using var allBody = await all.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Contains(allBody!.RootElement.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == unassigned);
        Assert.Contains(allBody.RootElement.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == assigned);

        using var queue = await staff.Client.GetAsync($"/api/staff/reports?tab=unassigned&priority=Normal&assignment=unassigned&search={unassigned}");
        Assert.Equal(HttpStatusCode.OK, queue.StatusCode);
        using var queueBody = await queue.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var items = queueBody!.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Single(items);
        Assert.Equal(unassigned, items[0].GetProperty("id").GetGuid());
        Assert.Equal("Normal", items[0].GetProperty("priority").GetString());

        foreach (var term in new[] { "No%20water", "old%20bridge", "Integration%20Staff" })
        {
            using var searched = await staff.Client.GetAsync($"/api/staff/reports?tab=unassigned&search={term}");
            Assert.Equal(HttpStatusCode.OK, searched.StatusCode);
            using var searchedBody = await searched.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
            Assert.Contains(searchedBody!.RootElement.GetProperty("items").EnumerateArray(),
                item => item.GetProperty("id").GetGuid() == unassigned);
        }

        using var invalidTab = await staff.Client.GetAsync("/api/staff/reports?tab=unknown");
        Assert.Equal(HttpStatusCode.BadRequest, invalidTab.StatusCode);
        using var invalidStatus = await staff.Client.GetAsync("/api/staff/reports?status=Unknown");
        Assert.Equal(HttpStatusCode.BadRequest, invalidStatus.StatusCode);

        using var invalidPriority = await staff.Client.GetAsync("/api/staff/reports?priority=Urgent");
        Assert.Equal(HttpStatusCode.BadRequest, invalidPriority.StatusCode);

        using var detail = await staff.Client.GetAsync($"/api/staff/reports/{assigned}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var detailBody = await detail.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(assigned, detailBody!.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("InProgress", detailBody.RootElement.GetProperty("status").GetString());
        Assert.Equal(staff.AccountId, detailBody.RootElement.GetProperty("assignedStaff").GetProperty("id").GetString());
        Assert.Contains("report-queue-assigned-", detailBody.RootElement.GetProperty("customer").GetProperty("email").GetString());
    }

    [Fact]
    public async Task Claims_are_atomic_and_only_the_assignee_can_change_or_message_a_report()
    {
        using var first = await CreateWebSessionAsync(AccountRoles.Staff);
        using var second = await CreateWebSessionAsync(AccountRoles.Staff);
        var reportId = await CreateReportAsync("claim-race");

        var claims = await Task.WhenAll(
            first.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions),
            second.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions));
        try
        {
            Assert.Single(claims, response => response.IsSuccessStatusCode);
            Assert.Single(claims, response => response.StatusCode == HttpStatusCode.Conflict);
        }
        finally { foreach (var response in claims) response.Dispose(); }

        using var third = await CreateWebSessionAsync(AccountRoles.Staff);
        using var unassignedWrite = await third.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = "I will take a look." }, JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, unassignedWrite.StatusCode);

        var assignee = await GetAssignedStaffId(reportId);
        var owner = assignee == first.AccountId ? first : second;
        using var priority = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/priority", new { priority = "High" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, priority.StatusCode);
        using var lowPriority = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/priority", new { priority = "Low" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, lowPriority.StatusCode);
        using var lowBody = await lowPriority.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("Low", lowBody!.RootElement.GetProperty("priority").GetString());
        using var status = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);
        using var invalidPriority = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/priority", new { priority = "Urgent" }, JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, invalidPriority.StatusCode);
        using var repeatedResolve = await owner.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Conflict, repeatedResolve.StatusCode);
    }

    [Fact]
    public async Task Cookie_role_and_csrf_rules_protect_staff_endpoints_and_admin_is_read_only()
    {
        var reportId = await CreateReportAsync("authz");
        using var anonymous = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousList = await anonymous.GetAsync("/api/staff/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousList.StatusCode);

        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var adminList = await admin.Client.GetAsync("/api/staff/reports?tab=all");
        Assert.Equal(HttpStatusCode.OK, adminList.StatusCode);
        using var adminWrite = await admin.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions);
        Assert.Equal(HttpStatusCode.Forbidden, adminWrite.StatusCode);

        using var noCsrf = await CreateWebSessionAsync(AccountRoles.Staff, csrfHeader: false);
        using var blocked = await noCsrf.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);

        using var restricted = await CreateRestrictedWebClientAsync();
        using var restrictedList = await restricted.GetAsync("/api/staff/reports");
        Assert.Equal(HttpStatusCode.Forbidden, restrictedList.StatusCode);
    }

    [Fact]
    public async Task Customer_and_staff_messages_are_persisted_ordered_and_customer_access_stays_owner_scoped()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var (customer, reportId) = await CreateReportSessionAsync("conversation");
        using (var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        using var staffMessage = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = "We are checking the supply." }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, staffMessage.StatusCode);
        using var textMessageBody = await staffMessage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Empty(textMessageBody!.RootElement.GetProperty("attachments").EnumerateArray());
        using var customerReply = await customer.PostAsJsonAsync($"/api/reports/{reportId}/messages", new { body = "Thank you." }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, customerReply.StatusCode);

        using var history = await staff.Client.GetAsync($"/api/staff/reports/{reportId}/messages?pageSize=1");
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
        using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var root = historyBody!.RootElement;
        Assert.True(root.GetProperty("nextBefore").GetInt64() > 0);
        Assert.Equal("Thank you.", root.GetProperty("items")[0].GetProperty("body").GetString());
        Assert.Empty(root.GetProperty("items")[0].GetProperty("attachments").EnumerateArray());
        using var next = await staff.Client.GetAsync($"/api/staff/reports/{reportId}/messages?pageSize=1&before={root.GetProperty("nextBefore").GetInt64()}");
        using var nextBody = await next.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("We are checking the supply.", nextBody!.RootElement.GetProperty("items")[0].GetProperty("body").GetString());
        Assert.Empty(nextBody.RootElement.GetProperty("items")[0].GetProperty("attachments").EnumerateArray());

        foreach (var invalid in new[] { "", "   ", new string('x', 2001) })
        {
            using var rejected = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = invalid }, JsonOptions);
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        }
        using var normalizedMessage = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = "  Spaces are trimmed.  " }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, normalizedMessage.StatusCode);
        using var normalizedBody = await normalizedMessage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("Spaces are trimmed.", normalizedBody!.RootElement.GetProperty("body").GetString());
        using var maxLengthMessage = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/messages", new { body = new string('x', 2000) }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, maxLengthMessage.StatusCode);
        using var maxLengthBody = await maxLengthMessage.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal(2000, maxLengthBody!.RootElement.GetProperty("body").GetString()!.Length);

        using var customerMessages = await customer.GetAsync($"/api/reports/{reportId}/messages");
        Assert.Equal(HttpStatusCode.OK, customerMessages.StatusCode);
        using var stranger = await CreateCustomerClientAsync("conversation-stranger");
        using var hidden = await stranger.GetAsync($"/api/reports/{reportId}/messages");
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);

        using var resolve = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, resolve.StatusCode);
        using var blockedReply = await customer.PostAsJsonAsync($"/api/reports/{reportId}/messages", new { body = "More details" }, JsonOptions);
        Assert.Equal(HttpStatusCode.Conflict, blockedReply.StatusCode);

        using var invalidHistory = await staff.Client.GetAsync($"/api/staff/reports/{reportId}/messages?before=0&pageSize=101");
        Assert.Equal(HttpStatusCode.BadRequest, invalidHistory.StatusCode);

        var concurrencyReport = await CreateReportSessionAsync("message-resolve-race");
        using (var claimRaceReport = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{concurrencyReport.ReportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claimRaceReport.StatusCode);
        var resolutionRace = await Task.WhenAll(
            staff.Client.PostAsJsonAsync($"/api/staff/reports/{concurrencyReport.ReportId}/status", new { status = "Resolved" }, JsonOptions),
            concurrencyReport.Client.PostAsJsonAsync($"/api/reports/{concurrencyReport.ReportId}/messages", new { body = "Concurrent customer note." }, JsonOptions));
        try
        {
            Assert.Equal(HttpStatusCode.OK, resolutionRace[0].StatusCode);
            Assert.Contains(resolutionRace[1].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        }
        finally { foreach (var response in resolutionRace) response.Dispose(); }
        using var afterResolution = await concurrencyReport.Client.PostAsJsonAsync($"/api/reports/{concurrencyReport.ReportId}/messages", new { body = "Must not be accepted." }, JsonOptions);
        Assert.Equal(HttpStatusCode.Conflict, afterResolution.StatusCode);
        concurrencyReport.Client.Dispose();
    }

    [Fact]
    public async Task Customer_and_personnel_can_send_and_read_private_image_attachments()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var (customer, reportId) = await CreateReportSessionAsync("chat-attachments");
        using (var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        using var customerForm = MultipartMessage(" ", ("..\\folder\\customer.PNG", "image/png", PngBytes));
        using var customerSend = await customer.PostAsync($"/api/reports/{reportId}/messages", customerForm);
        Assert.Equal(HttpStatusCode.OK, customerSend.StatusCode);
        using var customerMessage = await customerSend.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var customerMessageRoot = customerMessage!.RootElement;
        Assert.Equal("", customerMessageRoot.GetProperty("body").GetString());
        var customerAttachment = Assert.Single(customerMessageRoot.GetProperty("attachments").EnumerateArray());
        var customerAttachmentId = customerAttachment.GetProperty("id").GetGuid();
        Assert.Equal("customer.PNG", customerAttachment.GetProperty("fileName").GetString());
        Assert.Equal("image/png", customerAttachment.GetProperty("contentType").GetString());
        Assert.Equal(PngBytes.Length, customerAttachment.GetProperty("sizeBytes").GetInt64());
        Assert.False(customerAttachment.TryGetProperty("storageKey", out _));

        using var customerDownload = await customer.GetAsync($"/api/reports/{reportId}/attachments/{customerAttachmentId}");
        Assert.Equal(HttpStatusCode.OK, customerDownload.StatusCode);
        Assert.Equal(PngBytes, await customerDownload.Content.ReadAsByteArrayAsync());
        Assert.Equal("image/png", customerDownload.Content.Headers.ContentType!.MediaType);
        Assert.Equal("inline", customerDownload.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal("nosniff", customerDownload.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Contains("no-store", customerDownload.Headers.CacheControl!.ToString());

        using var stranger = await CreateCustomerClientAsync("chat-attachments-stranger");
        using var strangerDownload = await stranger.GetAsync($"/api/reports/{reportId}/attachments/{customerAttachmentId}");
        Assert.Equal(HttpStatusCode.NotFound, strangerDownload.StatusCode);
        using var wrongReport = await customer.GetAsync($"/api/reports/{Guid.NewGuid()}/attachments/{customerAttachmentId}");
        Assert.Equal(HttpStatusCode.NotFound, wrongReport.StatusCode);
        using var anonymous = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousDownload = await anonymous.GetAsync($"/api/reports/{reportId}/attachments/{customerAttachmentId}");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousDownload.StatusCode);
        using var restricted = await CreateRestrictedWebClientAsync();
        using var restrictedDownload = await restricted.GetAsync($"/api/staff/reports/{reportId}/attachments/{customerAttachmentId}");
        Assert.Equal(HttpStatusCode.Forbidden, restrictedDownload.StatusCode);

        var maxPng = new byte[ChatMessageRequestParser.MaximumFileBytes];
        PngBytes.CopyTo(maxPng, 0);
        using var staffForm = MultipartMessage("We have attached a line photo.",
            ("supplier.jpeg", "image/jpeg", JpegBytes), ("maximum.png", "image/png", maxPng),
            ("second.png", "image/png", PngBytes));
        using var staffSend = await staff.Client.PostAsync($"/api/staff/reports/{reportId}/messages", staffForm);
        Assert.Equal(HttpStatusCode.OK, staffSend.StatusCode);
        using var staffMessage = await staffSend.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        Assert.Equal("We have attached a line photo.", staffMessage!.RootElement.GetProperty("body").GetString());
        var staffAttachments = staffMessage.RootElement.GetProperty("attachments").EnumerateArray().ToArray();
        Assert.Equal(3, staffAttachments.Length);
        Assert.Equal(ChatMessageRequestParser.MaximumFileBytes, staffAttachments[1].GetProperty("sizeBytes").GetInt64());
        var staffAttachment = staffAttachments[0];
        var staffAttachmentId = staffAttachment.GetProperty("id").GetGuid();
        using var staffDownload = await staff.Client.GetAsync($"/api/staff/reports/{reportId}/attachments/{staffAttachmentId}");
        Assert.Equal(HttpStatusCode.OK, staffDownload.StatusCode);
        Assert.Equal(JpegBytes, await staffDownload.Content.ReadAsByteArrayAsync());

        using var history = await customer.GetAsync($"/api/reports/{reportId}/messages");
        using var historyBody = await history.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        var historyItems = historyBody!.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, historyItems.Length);
        Assert.Equal(1, historyItems[0].GetProperty("attachments").GetArrayLength());
        Assert.Equal(3, historyItems[1].GetProperty("attachments").GetArrayLength());

        using var admin = await CreateWebSessionAsync(AccountRoles.Admin);
        using var adminDownload = await admin.Client.GetAsync($"/api/staff/reports/{reportId}/attachments/{customerAttachmentId}");
        Assert.Equal(HttpStatusCode.OK, adminDownload.StatusCode);
        using var adminWriteForm = MultipartMessage(null, ("blocked.png", "image/png", PngBytes));
        using var adminWrite = await admin.Client.PostAsync($"/api/staff/reports/{reportId}/messages", adminWriteForm);
        Assert.Equal(HttpStatusCode.Forbidden, adminWrite.StatusCode);

        using var resolve = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, resolve.StatusCode);
        using var resolvedDownload = await customer.GetAsync($"/api/reports/{reportId}/attachments/{staffAttachmentId}");
        Assert.Equal(HttpStatusCode.OK, resolvedDownload.StatusCode);
        customer.Dispose();
    }

    [Fact]
    public async Task Multipart_validation_and_access_checks_prevent_partial_attachment_writes()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var (customer, reportId) = await CreateReportSessionAsync("chat-attachment-validation");
        using (var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        using var unsupportedEncoding = new StringContent("ignored");
        unsupportedEncoding.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        using var unsupported = await customer.PostAsync($"/api/reports/{reportId}/messages", unsupportedEncoding);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, unsupported.StatusCode);

        using var mismatch = MultipartMessage(null, ("wrong.png", "image/png", "not a png"u8.ToArray()));
        using var mismatchResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", mismatch);
        Assert.Equal(HttpStatusCode.BadRequest, mismatchResponse.StatusCode);

        using var extensionMismatch = MultipartMessage(null, ("wrong.png", "image/jpeg", JpegBytes));
        using var extensionMismatchResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", extensionMismatch);
        Assert.Equal(HttpStatusCode.BadRequest, extensionMismatchResponse.StatusCode);

        using var empty = MultipartMessage(null, ("empty.png", "image/png", []));
        using var emptyResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", empty);
        Assert.Equal(HttpStatusCode.BadRequest, emptyResponse.StatusCode);

        using var heic = MultipartMessage(null, ("camera.heic", "image/heic", [0, 0, 0, 0]));
        using var heicResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", heic);
        Assert.Equal(HttpStatusCode.BadRequest, heicResponse.StatusCode);

        using var tooMany = MultipartMessage(null,
            ("one.png", "image/png", PngBytes), ("two.png", "image/png", PngBytes),
            ("three.png", "image/png", PngBytes), ("four.png", "image/png", PngBytes));
        using var tooManyResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", tooMany);
        Assert.Equal(HttpStatusCode.BadRequest, tooManyResponse.StatusCode);

        var oversizedBytes = new byte[ChatMessageRequestParser.MaximumFileBytes + 1];
        PngBytes.CopyTo(oversizedBytes, 0);
        using var oversized = MultipartMessage(null, ("large.png", "image/png", oversizedBytes));
        using var oversizedResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", oversized);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, oversizedResponse.StatusCode);

        using var longBody = MultipartMessage(new string('x', 2001), ("too-long.png", "image/png", PngBytes));
        using var longBodyResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", longBody);
        Assert.Equal(HttpStatusCode.BadRequest, longBodyResponse.StatusCode);

        using var totalLimitContent = new ByteArrayContent(new byte[ChatMessageRequestParser.MaximumRequestBytes + 1]);
        totalLimitContent.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        using var totalLimitResponse = await customer.PostAsync($"/api/reports/{reportId}/messages", totalLimitContent);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, totalLimitResponse.StatusCode);

        using var noCsrf = await CreateWebSessionAsync(AccountRoles.Staff, csrfHeader: false);
        using var noCsrfForm = MultipartMessage(null, ("csrf.png", "image/png", PngBytes));
        using var noCsrfResponse = await noCsrf.Client.PostAsync($"/api/staff/reports/{reportId}/messages", noCsrfForm);
        Assert.Equal(HttpStatusCode.BadRequest, noCsrfResponse.StatusCode);

        using var unassigned = await CreateWebSessionAsync(AccountRoles.Staff);
        using var deniedForm = MultipartMessage(null, ("deny.png", "image/png", PngBytes));
        deniedForm.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        using var denied = await unassigned.Client.PostAsync($"/api/staff/reports/{reportId}/messages", deniedForm);
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        using var anonymous = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var anonymousBody = new StringContent("ignored");
        anonymousBody.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        using var anonymousResponse = await anonymous.PostAsync($"/api/reports/{reportId}/messages", anonymousBody);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        Assert.Empty(await db.ReportMessages.Where(message => message.ReportId == reportId).ToListAsync());
        Assert.Empty(await db.ReportMessageAttachments.Where(attachment => attachment.Message.ReportId == reportId).ToListAsync());
        var reportStorage = Path.Combine(fixture.ChatAttachmentRoot, reportId.ToString("N"));
        if (Directory.Exists(reportStorage)) Assert.Empty(Directory.GetFiles(reportStorage, "*", SearchOption.AllDirectories));
        customer.Dispose();
    }

    [Fact]
    public async Task A_status_change_during_upload_removes_files_without_committing_message_metadata()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var (customer, reportId) = await CreateReportSessionAsync("chat-attachment-race");
        using (var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        using var gatedFactory = fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IChatAttachmentStorage>();
            services.AddSingleton<GatedChatAttachmentStorage>(provider => new GatedChatAttachmentStorage(fixture.ChatAttachmentRoot,
                provider.GetRequiredService<ILoggerFactory>()));
            services.AddSingleton<IChatAttachmentStorage>(provider => provider.GetRequiredService<GatedChatAttachmentStorage>());
        }));
        using var uploadClient = gatedFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        uploadClient.DefaultRequestHeaders.Authorization = customer.DefaultRequestHeaders.Authorization;
        var storage = gatedFactory.Services.GetRequiredService<GatedChatAttachmentStorage>();
        using var form = MultipartMessage(null, ("race.png", "image/png", PngBytes));
        var uploadTask = uploadClient.PostAsync($"/api/reports/{reportId}/messages", form);
        try
        {
            await storage.FileSaved.Task.WaitAsync(TimeSpan.FromSeconds(15));
            using var resolve = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/status", new { status = "Resolved" }, JsonOptions);
            Assert.Equal(HttpStatusCode.OK, resolve.StatusCode);
        }
        finally { storage.AllowCommit.TrySetResult(); }

        using var response = await uploadTask;
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AqoursDbContext>();
        Assert.Empty(await db.ReportMessages.Where(message => message.ReportId == reportId).ToListAsync());
        Assert.Empty(await db.ReportMessageAttachments.Where(attachment => attachment.Message.ReportId == reportId).ToListAsync());
        var reportStorage = Path.Combine(fixture.ChatAttachmentRoot, reportId.ToString("N"));
        if (Directory.Exists(reportStorage)) Assert.Empty(Directory.GetFiles(reportStorage, "*", SearchOption.AllDirectories));
        customer.Dispose();
    }

    [Fact]
    public async Task Send_retains_files_for_uncertain_commit_but_cleans_confirmed_precommit_failure()
    {
        using var staff = await CreateWebSessionAsync(AccountRoles.Staff);
        var (customer, reportId) = await CreateReportSessionAsync("chat-attachment-commit-safety");
        using (var claim = await staff.Client.PostAsJsonAsync($"/api/staff/reports/{reportId}/claim", new { }, JsonOptions))
            Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        Ticket ticket;
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var store = scope.ServiceProvider.GetRequiredService<IStaffReportStore>();
            ticket = (await store.FindAsync(reportId, CancellationToken.None))!;
        }

        var actor = new ReportActor(staff.AccountId, AccountRoles.Staff);
        var notifications = new NoopReportNotifications();
        var uncertainStore = new CommitFaultStore(ticket, commitAcknowledgementLost: true);
        var uncertainStorage = new TrackingAttachmentStorage();
        var uncertainService = new StaffReportService(uncertainStore, notifications, TimeProvider.System, uncertainStorage);
        using var uncertainContent = new MemoryStream(PngBytes);
        var uncertainUpload = new NewChatAttachment("uncertain.png", "image/png", PngBytes.Length, uncertainContent);

        await Assert.ThrowsAsync<TicketCommitOutcomeUncertainException>(() =>
            uncertainService.SendAsync(actor, reportId, null, [uncertainUpload]));
        await uncertainStore.CommitVisible.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.NotEmpty(uncertainStorage.SavedKeys);
        Assert.Empty(uncertainStorage.DeletedKeys);

        var rollbackStore = new CommitFaultStore(ticket, commitAcknowledgementLost: false);
        var rollbackStorage = new TrackingAttachmentStorage();
        var rollbackService = new StaffReportService(rollbackStore, notifications, TimeProvider.System, rollbackStorage);
        using var rollbackContent = new MemoryStream(PngBytes);
        var rollbackUpload = new NewChatAttachment("rolled-back.png", "image/png", PngBytes.Length, rollbackContent);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            rollbackService.SendAsync(actor, reportId, null, [rollbackUpload]));
        Assert.NotEmpty(rollbackStorage.SavedKeys);
        Assert.Single(rollbackStorage.DeletedKeys);
        customer.Dispose();
    }

    private static byte[] PngBytes => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02];
    private static byte[] JpegBytes => [0xFF, 0xD8, 0xFF, 0xE0, 0x01, 0x02, 0x03];

    private static MultipartFormDataContent MultipartMessage(string? body,
        params (string FileName, string ContentType, byte[] Bytes)[] files)
    {
        var form = new MultipartFormDataContent();
        if (body is not null) form.Add(new StringContent(body), "body");
        foreach (var file in files)
        {
            var content = new ByteArrayContent(file.Bytes);
            content.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType);
            form.Add(content, "files", file.FileName);
        }
        return form;
    }

    private sealed class GatedChatAttachmentStorage : IChatAttachmentStorage
    {
        private readonly FileSystemChatAttachmentStorage _storage;
        public TaskCompletionSource FileSaved { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource AllowCommit { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public GatedChatAttachmentStorage(string rootPath, ILoggerFactory loggerFactory) =>
            _storage = new FileSystemChatAttachmentStorage(rootPath, loggerFactory.CreateLogger<FileSystemChatAttachmentStorage>());

        public async Task<string> SaveAsync(Guid reportId, Guid messageId, Guid attachmentId, string contentType,
            long expectedSizeBytes, Stream content, CancellationToken ct)
        {
            var storageKey = await _storage.SaveAsync(reportId, messageId, attachmentId, contentType, expectedSizeBytes, content, ct);
            FileSaved.TrySetResult();
            await AllowCommit.Task.WaitAsync(ct);
            return storageKey;
        }

        public Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct) => _storage.OpenReadAsync(storageKey, ct);

        public Task DeleteAsync(string storageKey, CancellationToken ct) => _storage.DeleteAsync(storageKey, ct);
    }

    private sealed class CommitFaultStore(Ticket ticket, bool commitAcknowledgementLost) : IStaffReportStore
    {
        public TaskCompletionSource<Guid> CommitVisible { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task<Ticket?> FindAsync(Guid id, CancellationToken ct) =>
            Task.FromResult<Ticket?>(ticket.Report.Id == id ? ticket : null);

        public Task<TicketPage> ListAsync(QueueCriteria criteria, string staffId, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<bool> ClaimAsync(Guid id, string staffId, DateTimeOffset now, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<TicketResult<ReportMessage>> WriteAsync(Guid id,
            Func<Report, TicketResult<ReportMessage>> change, CancellationToken ct)
        {
            var result = change(ticket.Report);
            if (!result.Succeeded) return Task.FromResult(result);
            if (commitAcknowledgementLost)
            {
                _ = PublishMessageAfterCommitDelayAsync(result.Value!.Id);
                throw new TicketCommitOutcomeUncertainException(
                    "The commit was accepted, but its acknowledgement was lost.", new TimeoutException("Injected commit acknowledgement loss."));
            }
            throw new InvalidOperationException("Injected failure before commit was attempted.");
        }

        public Task<MessagePage> MessagesAsync(Guid id, long? before, int pageSize, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<TicketMessage> MessageAsync(Guid messageId, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<ReportMessageAttachment?> FindAttachmentAsync(Guid attachmentId, CancellationToken ct) =>
            Task.FromResult<ReportMessageAttachment?>(null);

        private async Task PublishMessageAfterCommitDelayAsync(Guid messageId)
        {
            await Task.Delay(100);
            CommitVisible.TrySetResult(messageId);
        }
    }

    private sealed class TrackingAttachmentStorage : IChatAttachmentStorage
    {
        public List<string> SavedKeys { get; } = [];
        public List<string> DeletedKeys { get; } = [];

        public Task<string> SaveAsync(Guid reportId, Guid messageId, Guid attachmentId, string contentType,
            long expectedSizeBytes, Stream content, CancellationToken ct)
        {
            var key = $"{reportId:N}/{messageId:N}/{attachmentId:N}.png";
            SavedKeys.Add(key);
            return Task.FromResult(key);
        }

        public Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct) => throw new NotSupportedException();

        public Task DeleteAsync(string storageKey, CancellationToken ct)
        {
            DeletedKeys.Add(storageKey);
            return Task.CompletedTask;
        }
    }

    private sealed class NoopReportNotifications : IReportNotifications
    {
        public Task ReportCreatedAsync(Guid id) => Task.CompletedTask;
        public Task TicketUpdatedAsync(Guid id) => Task.CompletedTask;
        public Task MessageCreatedAsync(TicketMessage message) => Task.CompletedTask;
    }

    private async Task<Guid> CreateReportAsync(string suffix)
    {
        var (client, reportId) = await CreateReportSessionAsync(suffix);
        client.Dispose();
        return reportId;
    }

    private async Task<(HttpClient Client, Guid ReportId)> CreateReportSessionAsync(string suffix)
    {
        var client = await CreateCustomerClientAsync("report-" + suffix);
        using var created = await client.PostAsJsonAsync("/api/reports", new
        {
            issueType = "NoWater",
            description = "Report for " + suffix,
            address = new { regionCode = "0100000000", provinceCode = "0102800000", cityMunicipalityCode = "0102801000", barangayCode = "0102801001", details = "Near the old bridge" },
            latitude = 14.5,
            longitude = 121.2
        }, JsonOptions);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = await created.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return (client, body!.RootElement.GetProperty("id").GetGuid());
    }

    private async Task<HttpClient> CreateCustomerClientAsync(string prefix)
    {
        var email = $"{prefix}-{Guid.NewGuid():N}@aqours.test";
        var accountId = await CreateAccountAsync(email, AccountRoles.Customer);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var login = await client.PostAsJsonAsync("/api/auth/mobile/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var loginBody = await login.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", loginBody!.RootElement.GetProperty("accessToken").GetString());
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = ApiFixture.AdminPassword, newPassword = ApiFixture.ChangedPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var changedBody = await changed.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        client.DefaultRequestHeaders.Authorization = new("Bearer", changedBody!.RootElement.GetProperty("accessToken").GetString());
        return client;
    }

    private async Task<WebClient> CreateWebSessionAsync(string role, bool csrfHeader = true)
    {
        var email = $"staff-test-{Guid.NewGuid():N}@aqours.test";
        var accountId = await CreateAccountAsync(email, role);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        using var changed = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = ApiFixture.AdminPassword, newPassword = ApiFixture.ChangedPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        csrf = await GetCsrfAsync(client);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        if (csrfHeader) client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf);
        return new WebClient(client, accountId);
    }

    private async Task<HttpClient> CreateRestrictedWebClientAsync()
    {
        var email = $"restricted-staff-{Guid.NewGuid():N}@aqours.test";
        await CreateAccountAsync(email, AccountRoles.Staff);
        var client = fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", await GetCsrfAsync(client));
        using var login = await client.PostAsJsonAsync("/api/auth/web/login", new { email, password = ApiFixture.AdminPassword }, JsonOptions);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private async Task<string> CreateAccountAsync(string email, string role)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<AccountService>()
            .CreateAsync(new(email, "Integration", "Test", "Staff", ApiFixture.AdminPassword, role));
        Assert.True(result.Succeeded, string.Join("; ", result.Errors?.SelectMany(errors => errors.Value) ?? []));
        return result.Value!.Account.Id;
    }

    private async Task<string> GetAssignedStaffId(Guid reportId)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<AqoursDbContext>().Reports.SingleAsync(x => x.Id == reportId)).AssignedStaffId!;
    }

    private static async Task<string> GetCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/web/csrf");
        response.EnsureSuccessStatusCode();
        using var body = await response.Content.ReadFromJsonAsync<JsonDocument>(JsonOptions);
        return body!.RootElement.GetProperty("requestToken").GetString()!;
    }

    private sealed class WebClient(HttpClient client, string accountId) : IDisposable
    {
        public HttpClient Client { get; } = client;
        public string AccountId { get; } = accountId;
        public static implicit operator HttpClient(WebClient value) => value.Client;
        public void Dispose() => Client.Dispose();
    }
}
