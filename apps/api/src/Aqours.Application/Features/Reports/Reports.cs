using Aqours.Application.Features.Accounts;
using Aqours.Domain.Features.Reports;

namespace Aqours.Application.Features.Reports;

public sealed record AddressInput(string? RegionCode, string? ProvinceCode, string? CityMunicipalityCode,
    string? SubMunicipalityCode, string? BarangayCode, string? Details);
public sealed record SubmitReport(string? IssueType, string? Description, AddressInput? Address, double? Latitude, double? Longitude);
public sealed record ReportPage(IReadOnlyList<Report> Items, int Page, int PageSize, int TotalCount);

public interface IPsgcAddresses
{
    Outcome<ReportAddress> Resolve(AddressInput address);
}

public interface IReportStore
{
    Task AddAsync(Report report, CancellationToken cancellationToken);
    Task<Report?> FindAsync(string customerId, Guid id, CancellationToken cancellationToken);
    Task<ReportPage> ListAsync(string customerId, int page, int pageSize, CancellationToken cancellationToken);
}

public sealed class ReportService(IReportStore store, IPsgcAddresses addresses, TimeProvider clock)
{
    public async Task<Outcome<Report>> SubmitAsync(string customerId, SubmitReport input, CancellationToken cancellationToken = default)
    {
        var errors = new Dictionary<string, string[]>();
        // Comparing names excludes numeric enum representations and undefined values.
        var validIssue = Enum.TryParse<IssueType>(input.IssueType, out var issue) &&
            Enum.IsDefined(issue) && issue.ToString() == input.IssueType;
        if (!validIssue) errors["issueType"] = ["Choose NoWater, LowPressure, or DirtyWater."];
        var description = input.Description?.Trim();
        if (string.IsNullOrEmpty(description) || description.Length > Report.MaxDescriptionLength)
            errors["description"] = ["Description is required (up to 2,000 characters)."];
        if (input.Latitude is not { } latitude || !Report.ValidLatitude(latitude))
            errors["latitude"] = ["Latitude is required and must be a finite number between -90 and 90."];
        if (input.Longitude is not { } longitude || !Report.ValidLongitude(longitude))
            errors["longitude"] = ["Longitude is required and must be a finite number between -180 and 180."];
        ReportAddress? address = null;
        if (input.Address is null) errors["address"] = ["Address is required."];
        else
        {
            var resolved = addresses.Resolve(input.Address);
            address = resolved.Value;
            if (resolved.Errors is not null)
                foreach (var error in resolved.Errors) errors[error.Key] = error.Value;
        }
        if (errors.Count > 0) return new(null, errors);
        var report = new Report(customerId, issue, description!, address!, input.Latitude!.Value, input.Longitude!.Value, clock.GetUtcNow());
        await store.AddAsync(report, cancellationToken);
        return new(report);
    }

    public Task<Report?> FindAsync(string customerId, Guid id, CancellationToken cancellationToken = default) =>
        store.FindAsync(customerId, id, cancellationToken);

    public async Task<Outcome<ReportPage>> ListAsync(string customerId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var errors = new Dictionary<string, string[]>();
        if (page < 1) errors["page"] = ["Page must be positive."];
        if (pageSize is < 1 or > 100) errors["pageSize"] = ["Page size must be between 1 and 100."];
        if (errors.Count > 0) return new(null, errors);
        return new(await store.ListAsync(customerId, page, pageSize, cancellationToken));
    }
}
